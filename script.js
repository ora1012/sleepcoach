/**
 * SleepCoach (잠코치) - UI Refresh v3.0
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // 0. SUPABASE INIT
    // =========================================================================
    const SUPABASE_URL = 'https://pevjwlvhstuphslkrssb.supabase.co/';
    const SUPABASE_ANON_KEY = 'sb_publishable_fd51vxRm6rfwg724h3CqVA_L1LqI30y';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =========================================================================
    // 1. STATE MANAGEMENT
    // =========================================================================
    const AppState = {
        currentView: 'view-input',
        todayDateStr: getLocalDateString(),
        selectedDateStr: getLocalDateString(),
        calendarYear: new Date().getFullYear(),
        calendarMonth: new Date().getMonth() + 1,
        records: [],
        missions: [],
        selectedCondition: null,
        isEditMode: false,
        isLoggedIn: false
    };

    // =========================================================================
    // 2. UTILITY FUNCTIONS
    // =========================================================================
    function getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatKoreanDate(dateStr) {
        const d = new Date(dateStr);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    }

    function calculateSleepHours(sleepTime, wakeTime) {
        if (!sleepTime || !wakeTime) return 0;
        const [sh, sm] = sleepTime.split(":").map(Number);
        const [wh, wm] = wakeTime.split(":").map(Number);
        
        let sleepMins = sh * 60 + sm;
        let wakeMins = wh * 60 + wm;
        
        if (wakeMins <= sleepMins) wakeMins += 24 * 60;
        return parseFloat(((wakeMins - sleepMins) / 60).toFixed(1));
    }

    function timeToMinutesContinuous(timeStr) {
        const [h, m] = timeStr.split(":").map(Number);
        let adjustedH = h < 12 ? h + 24 : h;
        return adjustedH * 60 + m;
    }

    function formatPhoneMinutes(mins) {
        return `${mins}min`;
    }

    // =========================================================================
    // 3. STORAGE MODULE
    // =========================================================================
    const StorageDB = {
        loadAll() {
            const r = localStorage.getItem('sleepcoach_records');
            const m = localStorage.getItem('sleepcoach_missions');
            AppState.records = r ? JSON.parse(r) : [];
            AppState.missions = m ? JSON.parse(m) : [];
        },
        saveRecords() {
            localStorage.setItem('sleepcoach_records', JSON.stringify(AppState.records));
        },
        saveMissions() {
            localStorage.setItem('sleepcoach_missions', JSON.stringify(AppState.missions));
        },
        clearAll() {
            localStorage.removeItem('sleepcoach_records');
            localStorage.removeItem('sleepcoach_missions');
            AppState.records = [];
            AppState.missions = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("sc_comment_")) {
                    localStorage.removeItem(k);
                    i--;
                }
            }
        }
    };

    const DBService = {
        toSnake(r) {
            return {
                date: r.date,
                sleep_time: r.sleepTime,
                wake_time: r.wakeTime,
                sleep_hours: r.sleepHours,
                phone_minutes: r.phoneMinutes,
                condition: r.condition,
                day_sleepy: r.daySleepy ? 1 : 0
            };
        },
        toCamel(r) {
            return {
                date: r.date,
                sleepTime: r.sleep_time,
                wakeTime: r.wake_time,
                sleepHours: r.sleep_hours,
                phoneMinutes: r.phone_minutes,
                condition: r.condition,
                daySleepy: r.day_sleepy === 1
            };
        },
        async loadRecords() {
            const { data, error } = await supabase.from('records').select('*');
            if (!error && data) {
                AppState.records = data.map(this.toCamel);
            }
        },
        async saveRecord(rec) {
            const { error } = await supabase
                .from('records')
                .upsert([this.toSnake(rec)], { onConflict: 'user_id,date' });
            if (error) console.error("Supabase Save error:", error);
        },
        async migrateLocalRecords() {
            const localRaw = localStorage.getItem('sleepcoach_records');
            if (localRaw) {
                const localRecs = JSON.parse(localRaw);
                if (localRecs && localRecs.length > 0) {
                    if (confirm(`로컬에 저장된 ${localRecs.length}개의 기록이 있습니다. 계정으로 이전하시겠습니까?`)) {
                        const { error } = await supabase
                            .from('records')
                            .upsert(localRecs.map(r => this.toSnake(r)), { onConflict: 'user_id,date' });
                        if (!error) {
                            localStorage.removeItem('sleepcoach_records');
                            alert('이전이 완료되었습니다.');
                        } else {
                            console.error("Migration error:", error);
                        }
                    }
                }
            }
        }
    };

    // =========================================================================
    // 4. AI & ANALYSIS ENGINE
    // =========================================================================
    const Analyzer = {
        analyze(records) {
            if (records.length < 3) return null;
            const recent = [...records].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-7);
            const count = recent.length;
            const avgSleep = recent.reduce((sum, r) => sum + r.sleepHours, 0) / count;
            const avgPhone = recent.reduce((sum, r) => sum + r.phoneMinutes, 0) / count;
            const avgCondition = recent.reduce((sum, r) => sum + r.condition, 0) / count;

            // Compute values for Rules 3 and 4
            const sleepMins = recent.map(r => timeToMinutesContinuous(r.sleepTime));
            const avgSleepMins = sleepMins.reduce((sum, m) => sum + m, 0) / count;
            const variance = sleepMins.reduce((sum, m) => sum + Math.pow(m - avgSleepMins, 2), 0) / count;
            const stdDev = Math.sqrt(variance);
            const daySleepyRatio = recent.filter(r => r.daySleepy).length / count;

            const patterns = [];
            const possibleMissions = [];

            // Rule 1: Sleep Duration
            if (avgSleep < 8.0) {
                patterns.push(`주중에 권장보다<br><strong>${(8.0 - avgSleep).toFixed(1)}시간</strong><br>부족해요`);
                possibleMissions.push('sleep_short');
            }

            // Rule 2: Phone Usage / Condition
            const phoneArr = recent.map(r => r.phoneMinutes).sort((a,b)=>a-b);
            const medianPhone = phoneArr[Math.floor(count/2)];
            const highPhone = recent.filter(r => r.phoneMinutes > medianPhone);
            const lowPhone = recent.filter(r => r.phoneMinutes <= medianPhone);
            
            if (highPhone.length > 0 && lowPhone.length > 0) {
                const condH = highPhone.reduce((sum, r) => sum + r.condition, 0) / highPhone.length;
                const condL = lowPhone.reduce((sum, r) => sum + r.condition, 0) / lowPhone.length;
                if (condL - condH >= 1.0) {
                    patterns.push(`폰 사용이<br><strong>${medianPhone}분</strong> 넘은 날엔<br>컨디션이 낮았어요`);
                    possibleMissions.push('phone_high');
                }
            }

            // Rule 3: Irregular sleep
            if (stdDev >= 60) {
                patterns.push(`자는 시간이<br>매일 <strong>들쭉날쭉해요</strong>`);
                possibleMissions.push('sleep_irregular');
            }

            // Rule 4: Day sleepy
            if (daySleepyRatio >= 0.5) {
                patterns.push(`이번 주 <strong>절반 이상</strong><br>낮에 졸렸어요`);
                possibleMissions.push('day_sleepy');
            }
            
            let missionType = 'positive';
            if (possibleMissions.length > 0) {
                const dayIndex = new Date().getDate();
                missionType = possibleMissions[dayIndex % possibleMissions.length];
            }
            
            // Add positive patterns if we don't have enough patterns
            if (patterns.length === 0) {
                patterns.push(`이번 주는<br>권장 수면시간을<br><strong>잘 채웠어요!</strong>`);
                patterns.push(`폰 사용 시간이<br><strong>일정하게</strong><br>유지되고 있어요`);
            } else if (patterns.length === 1) {
                if (avgSleep >= 8.0) patterns.push(`이번 주는<br>권장 수면시간을<br><strong>잘 채웠어요!</strong>`);
                else patterns.push(`폰 사용 시간이<br><strong>일정하게</strong><br>유지되고 있어요`);
            }

            const scoreDetails = this.calculateScoreDetails(recent);

            return {
                avgSleep: avgSleep,
                avgPhone: avgPhone,
                avgCondition: avgCondition,
                patterns: patterns.slice(0, 2),
                missionType: missionType || 'positive',
                score: scoreDetails.total,
                scoreDetails: scoreDetails
            };
        },

        calculateScoreDetails(recent) {
            const count = recent.length;
            const avgSleep = recent.reduce((sum, r) => sum + r.sleepHours, 0) / count;
            const avgPhone = recent.reduce((sum, r) => sum + r.phoneMinutes, 0) / count;
            
            // Regularity (Std Dev of sleep time)
            const sleepMins = recent.map(r => timeToMinutesContinuous(r.sleepTime));
            const avgSleepMins = sleepMins.reduce((sum, m) => sum + m, 0) / count;
            const variance = sleepMins.reduce((sum, m) => sum + Math.pow(m - avgSleepMins, 2), 0) / count;
            const stdDev = Math.sqrt(variance);
            
            // 1. Sleep Duration (Max 40)
            let sleepScore = 0;
            if (avgSleep >= 8.0) sleepScore = 40;
            else if (avgSleep >= 7.0) sleepScore = 35;
            else if (avgSleep >= 6.0) sleepScore = 30;
            else if (avgSleep >= 5.0) sleepScore = 20;
            else sleepScore = 10;
            
            // 2. Regularity (Max 30)
            let regScore = 0;
            if (stdDev <= 30) regScore = 30;
            else if (stdDev <= 60) regScore = 25;
            else if (stdDev <= 90) regScore = 20;
            else if (stdDev <= 120) regScore = 15;
            else regScore = 10;
            
            // 3. Phone Usage (Max 30)
            let phoneScore = 0;
            if (avgPhone <= 30) phoneScore = 30;
            else if (avgPhone <= 60) phoneScore = 25;
            else if (avgPhone <= 120) phoneScore = 15;
            else phoneScore = 10;
            
            return {
                total: sleepScore + regScore + phoneScore,
                sleepScore,
                regScore,
                phoneScore,
                stdDev
            };
        },

        getMissionText(type, legacyDateFallback = null) {
            const map = {
                sleep_short_urgent: [
                    "오늘은 평소보다 1시간 일찍 눕기",
                    "오늘은 무조건 10시에 불 끄기",
                    "수면 빚 청산의 날! 일찍 잠자리에 들기"
                ],
                sleep_short: [
                    "오늘은 평소보다 30분 일찍 누워보기",
                    "수면 부족! 오늘 밤엔 30분만 당겨서 자기",
                    "내일의 활력을 위해 20분 먼저 눈 감기"
                ],
                phone_high: [
                    "오늘은 11시 전에 폰을 충전기에 꽂아두기",
                    "자기 전 30분은 폰 대신 스트레칭하기",
                    "잠자리에서 스마트폰 보지 않기",
                    "오늘은 유튜브 대신 잔잔한 음악 듣기"
                ],
                sleep_irregular: [
                    "오늘은 어제와 같은 시각에 누워보기",
                    "주말에도 평일처럼 같은 시간에 일어나기",
                    "수면 리듬 되찾기! 정해진 시간에 눕기"
                ],
                day_sleepy: [
                    "점심 후 10분 가벼운 산책하기",
                    "낮에 졸리면 15분만 엎드려 낮잠 자기",
                    "햇빛 보면서 10분 걷고 오기"
                ],
                positive: [
                    "오늘도 이대로 푹 자기! 가벼운 스트레칭 추천해요",
                    "좋은 수면 습관 유지 중! 자기 전 따뜻한 물 한잔 어때요?",
                    "완벽해요! 오늘 밤도 좋은 꿈 꾸세요"
                ]
            };
            const options = map[type] || map.positive;
            
            if (legacyDateFallback) {
                return options[0];
            }
            
            const dayOfMonth = new Date().getDate();
            return options[dayOfMonth % options.length];
        },

        async getAiComment(result, todayRec) {
            try {
                let info = `평균 수면: ${result.avgSleep.toFixed(1)}시간, 폰 사용: ${Math.round(result.avgPhone)}분`;
                let prompt = `수면 코치로서 다정한 반말로 2문장 짧게 조언해줘 (매번 조금씩 다른 표현으로 말해줘, id:${Math.random().toString().slice(2,6)}): ${info}`;
                
                if (todayRec) {
                    info = `어젯밤 수면: ${todayRec.sleepHours.toFixed(1)}시간 (최근 평균 ${result.avgSleep.toFixed(1)}시간), 자기 전 폰: ${todayRec.phoneMinutes}분, 컨디션: ${todayRec.condition}/5, 낮 졸림: ${todayRec.daySleepy ? '예' : '아니오'}`;
                    prompt = `어젯밤 기록에 먼저 반응하고, 그다음 오늘 밤을 위한 한 가지 제안을 해줘. 다정한 반말 2문장. 예: '어젯밤 3시간 40분은 너무 적었어. 오늘은 11시 전에 꼭 눕자.' (id:${Math.random().toString().slice(2,6)}): ${info}`;
                }

                // Cloudflare Worker API Endpoint
                const workerUrl = "https://sleepcoach.ora111012.workers.dev/"; 
                
                const res = await fetch(workerUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: prompt }),
                    cache: "no-store"
                });
                
                if (!res.ok) throw new Error("Worker API Failed");
                const data = await res.json();
                
                if (data.comment) {
                    return data.comment;
                } else {
                    throw new Error("No comment in response");
                }
            } catch (e) {
                console.error("AI Comment Fetch Error:", e);
                // Fallback comments
                const fallbacks = [
                    "요즘 조금 늦게 자는 날이 많았네요. 오늘은 완벽하게 하려고 하기보다, 폰을 10분만 일찍 내려놓는 것부터 해봐요. 그 정도면 충분히 잘하고 있어요.",
                    "하루의 피로를 푸는 데는 수면이 최고예요! 오늘은 평소보다 조금만 더 일찍 눈을 감아볼까요?",
                    "규칙적인 수면 패턴을 만들어가는 중이군요. 폰 사용을 조금 줄이면 더 깊은 잠을 잘 수 있을 거예요."
                ];
                return fallbacks[Math.floor(Math.random() * fallbacks.length)];
            }
        }
    };

    // =========================================================================
    // 5. UI CONTROLLER MODULE
    // =========================================================================
    const UI = {
        els: {
            dateBadge: document.getElementById('current-date'),
            datePicker: document.getElementById('date-picker'),
            form: document.getElementById('sleep-form'),
            inSleep: document.getElementById('input-sleep-time'),
            inWake: document.getElementById('input-wake-time'),
            inPhone: document.getElementById('input-phone-time'),
            phoneDisp: document.getElementById('phone-time-display'),
            phoneFill: document.getElementById('slider-progress-fill'),
            ratingBtns: document.querySelectorAll('.emoji-btn'),
            inSleepy: document.getElementById('input-day-sleepy'),
            btnSave: document.getElementById('btn-save-record'),
            
            navBtns: {
                'view-input': document.getElementById('nav-btn-input'),
                'view-analysis': document.getElementById('nav-btn-data'),
                'view-mission': document.getElementById('nav-btn-mission'),
                'view-calendar': document.getElementById('nav-btn-calendar')
            },
            
            views: {
                'view-input': document.getElementById('view-input'),
                'view-analysis': document.getElementById('view-analysis'),
                'view-mission': document.getElementById('view-mission'),
                'view-calendar': document.getElementById('view-calendar')
            },

            // Auth elements
            btnGoogleLogin: document.getElementById('btn-google-login'),
            btnLogout: document.getElementById('btn-logout'),
            userProfile: document.getElementById('user-profile'),
            userName: document.getElementById('user-name'),
            userAvatar: document.getElementById('user-avatar'),

            // Settings
            btnSettings: document.getElementById('btn-settings-toggle'),
            bubble: document.getElementById('settings-bubble'),

            // Calendar
            btnPrevMonth: document.getElementById('btn-prev-month'),
            btnNextMonth: document.getElementById('btn-next-month'),
            calMonthTitle: document.getElementById('calendar-month-title'),
            calGrid: document.getElementById('calendar-grid'),
            calDetailPanel: document.getElementById('calendar-detail-panel'),
            calDetailDate: document.getElementById('cal-detail-date'),
            calDetailCond: document.getElementById('cal-detail-condition'),
            calDetailSleep: document.getElementById('cal-detail-sleep'),
            calDetailPhone: document.getElementById('cal-detail-phone'),
            btnEditCalRec: document.getElementById('btn-edit-cal-record'),

            // Analysis
            analysisLocked: document.getElementById('analysis-locked'),
            analysisUnlocked: document.getElementById('analysis-unlocked'),
            lastNightCard: document.getElementById('last-night-card'),
            lastNightSleepTime: document.getElementById('last-night-sleep-time'),
            lastNightDiff: document.getElementById('last-night-diff'),
            lastNightReaction: document.getElementById('last-night-reaction'),
            lockFill: document.getElementById('locked-progress-fill'),
            statAvgSleep: document.getElementById('stat-avg-sleep'),
            patternsList: document.getElementById('patterns-list'),
            aiComment: document.getElementById('ai-comment-text'),
            btnRefreshComment: document.getElementById('btn-refresh-comment'),
            
            // Dashboard
            dashboardSection: document.getElementById('dashboard-section'),
            chartSleepTrend: document.getElementById('chart-sleep-trend'),
            chartPhoneCond: document.getElementById('chart-phone-condition'),
            dashMissionRate: document.getElementById('dashboard-mission-rate'),
            dashMissionText: document.getElementById('dashboard-mission-text'),

            // Calendar
            calMonthlySummary: document.getElementById('calendar-monthly-summary'),

            // Mission
            missionActive: document.getElementById('mission-active'),
            missionDone: document.getElementById('mission-done'),
            missionText: document.getElementById('mission-text'),
            btnCompleteM: document.getElementById('btn-complete-mission')
        },

        init() {
            this.bindEvents();
            this.updateInputView();
        },

        switchView(target) {
            if (AppState.currentView === target) return;
            
            // Toggle active classes
            Object.keys(this.els.navBtns).forEach(k => {
                this.els.navBtns[k].classList.toggle('active', k === target);
                this.els.views[k].classList.toggle('active', k === target);
            });
            
            AppState.currentView = target;

            // Trigger specific updates
            if (target === 'view-input') this.updateInputView();
            if (target === 'view-analysis') this.updateAnalysisView();
            if (target === 'view-mission') this.updateMissionView();
            if (target === 'view-calendar') this.renderCalendar();
        },

        updateInputView() {
            this.els.dateBadge.textContent = formatKoreanDate(AppState.selectedDateStr);
            if (this.els.datePicker) {
                this.els.datePicker.value = AppState.selectedDateStr;
                this.els.datePicker.max = getLocalDateString();
            }
            const exist = AppState.records.find(r => r.date === AppState.selectedDateStr);
            
            if (exist) {
                AppState.isEditMode = true;
                this.els.inSleep.value = exist.sleepTime;
                this.els.inWake.value = exist.wakeTime;
                this.els.inPhone.value = exist.phoneMinutes;
                AppState.selectedSleepy = exist.daySleepy;
                AppState.selectedCondition = exist.condition;
                this.els.btnSave.disabled = false;
            } else {
                AppState.isEditMode = false;
                this.els.inSleep.value = "23:20";
                this.els.inWake.value = "07:00";
                this.els.inPhone.value = "90";
                AppState.selectedSleepy = false;
                AppState.selectedCondition = null;
                this.els.btnSave.disabled = true;
            }

            this.updateSliderUI();
            this.updateEmojiUI();
            
            if (this.els.inSleepy) {
                this.els.inSleepy.checked = AppState.selectedSleepy === true;
            }
            this.checkFormValidity();
        },

        checkFormValidity() {
            this.els.btnSave.disabled = (AppState.selectedCondition === null);
        },

        updateSliderUI() {
            const val = this.els.inPhone.value;
            const max = this.els.inPhone.max;
            const percent = (val / max) * 100;
            this.els.phoneDisp.textContent = `${val}min`;
            this.els.phoneFill.style.width = `${percent}%`;
        },

        updateEmojiUI() {
            this.els.ratingBtns.forEach(b => {
                const isActive = parseInt(b.dataset.value) === AppState.selectedCondition;
                b.classList.toggle('active', isActive);
            });
        },

        async updateAnalysisView() {
            const recs = AppState.records;
            if (recs.length < 3) {
                this.els.analysisLocked.style.display = 'block';
                this.els.analysisUnlocked.style.display = 'none';
                this.els.analysisLocked.querySelector('h3').innerHTML = `<strong>${3 - recs.length}일만</strong> 더 기록하면 분석을 시작해요`;
                this.els.lockFill.style.width = `${(recs.length / 3) * 100}%`;
                return;
            }

            this.els.analysisLocked.style.display = 'none';
            this.els.analysisUnlocked.style.display = 'flex';

            const res = Analyzer.analyze(recs);
            const todayRec = recs.find(r => r.date === AppState.todayDateStr);

            if (todayRec) {
                this.els.lastNightCard.style.display = 'block';
                const hrs = Math.floor(todayRec.sleepHours);
                const mins = Math.round((todayRec.sleepHours - hrs) * 60);
                this.els.lastNightSleepTime.innerHTML = `${hrs}시간 ${mins > 0 ? mins+'분' : ''}`;
                
                const diff = todayRec.sleepHours - res.avgSleep;
                const diffAbs = Math.abs(diff);
                const diffHrs = Math.floor(diffAbs);
                const diffMins = Math.round((diffAbs - diffHrs) * 60);
                const diffStr = diffHrs > 0 ? `${diffHrs}시간 ${diffMins}분` : (diffMins > 0 ? `${diffMins}분` : '0분');
                
                if (diff > 0.1) {
                    this.els.lastNightDiff.textContent = `평소보다 ${diffStr} 더 잤어요`;
                } else if (diff < -0.1) {
                    this.els.lastNightDiff.textContent = `평소보다 ${diffStr} 적게 잤어요`;
                } else {
                    this.els.lastNightDiff.textContent = `평소와 비슷하게 잤어요`;
                }

                let reactions = [];
                if (todayRec.sleepHours < 5) {
                    reactions = [
                        "오늘은 진짜 일찍 눕자. 몸이 빚을 갚아야 해.",
                        "수면 빚이 쌓이면 안 돼. 오늘 밤엔 무조건 푹 자기!",
                        "너무 적게 잤어. 오늘은 다른 거 다 제쳐두고 쉬자."
                    ];
                    this.els.lastNightReaction.style.color = '#ef4444';
                    res.missionType = 'sleep_short_urgent'; // Mission override
                } else if (todayRec.sleepHours < 7) {
                    reactions = [
                        "조금 부족했어. 오늘 밤 30분만 당겨보자.",
                        "애매하게 피곤할 수 있겠다. 폰 조금만 덜 보고 자자.",
                        "나쁘진 않지만 조금 더 자면 좋겠어!"
                    ];
                    this.els.lastNightReaction.style.color = '#6b21a8';
                } else if (todayRec.sleepHours <= 9) {
                    reactions = [
                        "딱 좋게 잤네!",
                        "아주 훌륭해! 오늘 하루도 화이팅!",
                        "이 패턴 그대로만 유지하자!"
                    ];
                    this.els.lastNightReaction.style.color = '#10b981';
                } else {
                    reactions = [
                        "많이 잤네, 어제 피곤했나 봐",
                        "푹 잤으니 오늘 컨디션은 최고겠다!",
                        "정말 오래 잤네! 오늘 에너지가 넘칠 거야."
                    ];
                    this.els.lastNightReaction.style.color = '#3b82f6';
                }
                const randomReact = reactions[Math.floor(Math.random() * reactions.length)];
                this.els.lastNightReaction.textContent = randomReact;
            } else {
                this.els.lastNightCard.style.display = 'none';
            }

            const hrs = Math.floor(res.avgSleep);
            const mins = Math.round((res.avgSleep - hrs) * 60);
            
            const scoreEl = document.getElementById('stat-sleep-score');
            if(scoreEl) scoreEl.textContent = `${res.score}점`;
            
            this.els.statAvgSleep.innerHTML = `${hrs}시간 ${mins > 0 ? mins+'분' : ''}`;

            // Add Detail Scores Update
            const details = res.scoreDetails;
            const sleepScore = details.sleepScore;
            const regScore = details.regScore;
            const phoneScore = details.phoneScore;

            const detailSleepScore = document.getElementById('detail-sleep-score');
            if (detailSleepScore) {
                detailSleepScore.textContent = `${sleepScore}/40`;
                document.getElementById('bar-sleep-score').style.width = `${(sleepScore / 40) * 100}%`;
                
                const sHrs = Math.floor(res.avgSleep);
                const sMins = Math.round((res.avgSleep - sHrs) * 60);
                document.getElementById('detail-sleep-val').textContent = `${sHrs}시간 ${sMins > 0 ? sMins+'분' : ''}`;

                document.getElementById('detail-reg-score').textContent = `${regScore}/30`;
                document.getElementById('bar-reg-score').style.width = `${(regScore / 30) * 100}%`;
                document.getElementById('detail-reg-val').textContent = `±${Math.round(details.stdDev)}분`;

                document.getElementById('detail-phone-score').textContent = `${phoneScore}/30`;
                document.getElementById('bar-phone-score').style.width = `${(phoneScore / 30) * 100}%`;
                document.getElementById('detail-phone-val').textContent = `${Math.round(res.avgPhone)}분`;
            }

            this.els.patternsList.innerHTML = '';
            res.patterns.forEach(p => {
                this.els.patternsList.innerHTML += `
                <div class="insight-card">
                    ${p}
                    <i class="fa-solid fa-moon moon-icon"></i>
                </div>`;
            });

            // Handle Mission setup
            const mText = Analyzer.getMissionText(res.missionType);
            let todayMiss = AppState.missions.find(m => m.date === AppState.todayDateStr);
            if (!todayMiss) {
                todayMiss = { date: AppState.todayDateStr, type: res.missionType, text: mText, done: false };
                AppState.missions.push(todayMiss);
            } else if (!todayMiss.done) {
                // 분석 데이터가 바뀌면 아직 완료하지 않은 오늘의 미션 내용도 업데이트
                todayMiss.type = res.missionType;
                todayMiss.text = mText;
            }
            StorageDB.saveMissions();

            // AI Comment Cache
            const cKey = `sc_comment_${AppState.todayDateStr}`;
            const cached = localStorage.getItem(cKey);
            if (cached) {
                this.els.aiComment.textContent = cached;
                this.els.aiComment.classList.remove('loading');
            } else {
                this.els.aiComment.textContent = "AI가 분석 중입니다...";
                this.els.aiComment.classList.add('loading');
                const cmt = await Analyzer.getAiComment(res, todayRec);
                localStorage.setItem(cKey, cmt);
                this.els.aiComment.textContent = cmt;
                this.els.aiComment.classList.remove('loading');
            }

            // Dashboard
            if (this.els.dashboardSection) {
                this.renderDashboard(recs);
            }
        },

        chartInstances: {},

        renderDashboard(records) {
            const recent14 = [...records].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-14);
            
            // Sleep Trend Chart
            if (this.chartInstances.sleep) this.chartInstances.sleep.destroy();
            const sleepCtx = this.els.chartSleepTrend.getContext('2d');
            
            const sleepLabels = recent14.map(r => {
                const d = new Date(r.date);
                return `${d.getMonth()+1}/${d.getDate()}`;
            });
            const sleepData = recent14.map(r => r.sleepHours);
            const sleepColors = recent14.map(r => {
                if (r.sleepHours < 6) return '#9a7bff'; 
                if (r.sleepHours < 7.5) return '#6592ff'; 
                return '#4850ff'; 
            });

            this.chartInstances.sleep = new Chart(sleepCtx, {
                type: 'bar',
                data: {
                    labels: sleepLabels,
                    datasets: [
                        {
                            type: 'line',
                            label: '권장 수면 (8시간)',
                            data: Array(recent14.length).fill(8),
                            borderColor: 'rgba(255,255,255,0.4)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false
                        },
                        {
                            type: 'bar',
                            label: '수면 시간',
                            data: sleepData,
                            backgroundColor: sleepColors,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            max: 12,
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { color: '#a0a2b1' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#a0a2b1' }
                        }
                    }
                }
            });

            // Phone vs Condition Chart
            if (this.chartInstances.phone) this.chartInstances.phone.destroy();
            const phoneCtx = this.els.chartPhoneCond.getContext('2d');
            
            const sortedByPhone = [...recent14].sort((a,b) => a.phoneMinutes - b.phoneMinutes);
            const phoneLabels = sortedByPhone.map(r => `${r.phoneMinutes}분`);
            const phoneData = sortedByPhone.map(r => r.phoneMinutes);
            const condData = sortedByPhone.map(r => r.condition);

            this.chartInstances.phone = new Chart(phoneCtx, {
                type: 'bar',
                data: {
                    labels: phoneLabels,
                    datasets: [
                        {
                            type: 'line',
                            label: '컨디션',
                            data: condData,
                            borderColor: '#fbbf24',
                            backgroundColor: '#fbbf24',
                            borderWidth: 2,
                            yAxisID: 'y1',
                            tension: 0.3
                        },
                        {
                            type: 'bar',
                            label: '폰 사용(분)',
                            data: phoneData,
                            backgroundColor: 'rgba(124,114,255,0.6)',
                            borderRadius: 4,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { color: '#a0a2b1' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 0,
                            max: 5,
                            grid: { display: false },
                            ticks: { color: '#fbbf24', stepSize: 1 }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#a0a2b1', maxRotation: 0, autoSkip: true }
                        }
                    }
                }
            });

            // Mission Completion Rate
            const today = new Date();
            const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            const thisMonthMissions = AppState.missions.filter(m => m.date.startsWith(monthPrefix));
            const doneMissions = thisMonthMissions.filter(m => m.done);
            
            if (thisMonthMissions.length > 0) {
                const rate = Math.round((doneMissions.length / thisMonthMissions.length) * 100);
                this.els.dashMissionRate.textContent = `${doneMissions.length}/${thisMonthMissions.length}`;
                this.els.dashMissionText.textContent = `이번 달 미션 완료 (${rate}%)`;
            } else {
                this.els.dashMissionRate.textContent = `0/0`;
                this.els.dashMissionText.textContent = `이번 달 미션 완료 (0%)`;
            }
        },

        updateMissionView() {
            const todayStr = AppState.todayDateStr;
            const todayMiss = AppState.missions.find(m => m.date === todayStr);
            
            if (!todayMiss) {
                this.els.missionText.textContent = "아직 분석 데이터가 부족하여 미션이 없습니다.";
                this.els.btnCompleteM.style.display = 'none';
            } else {
                this.els.missionText.textContent = todayMiss.text;
                if (todayMiss.done) {
                    this.els.missionActive.style.display = 'none';
                    this.els.missionDone.style.display = 'block';
                } else {
                    this.els.missionActive.style.display = 'block';
                    this.els.missionDone.style.display = 'none';
                    this.els.btnCompleteM.style.display = 'block';
                }
            }

            // Render mission list
            const missionListEl = document.getElementById('mission-list-content');
            if (missionListEl) {
                missionListEl.innerHTML = '';
                
                // Sort missions by date descending
                const sortedMissions = [...AppState.missions].sort((a, b) => b.date.localeCompare(a.date));
                
                if (sortedMissions.length === 0) {
                    missionListEl.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding: 20px;">기록된 미션이 없습니다.</div>';
                } else {
                    sortedMissions.forEach(m => {
                        const mText = m.text || Analyzer.getMissionText(m.type, m.date);
                        const isDone = m.done;
                        const isToday = m.date === todayStr;
                        
                        let iconClassActual = 'fail';
                        let iconHtml = '<i class="fa-solid fa-xmark"></i>';
                        
                        if (isDone) {
                            iconClassActual = 'done';
                            iconHtml = '<i class="fa-solid fa-check"></i>';
                        } else if (isToday) {
                            iconClassActual = 'pending';
                            iconHtml = '<i class="fa-solid fa-ellipsis"></i>';
                        }
                        
                        const d = new Date(m.date);
                        const days = ['일', '월', '화', '수', '목', '금', '토'];
                        const dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

                        missionListEl.innerHTML += `
                            <div class="mission-history-item">
                                <div class="mission-history-icon ${iconClassActual}" style="${iconClassActual === 'pending' ? 'background: rgba(255, 255, 255, 0.1); color: #a0a2b1;' : ''}">
                                    ${iconHtml}
                                </div>
                                <div class="mission-history-details">
                                    <div class="mission-history-date">${dateStr}</div>
                                    <div class="mission-history-text">${mText}</div>
                                </div>
                            </div>
                        `;
                    });
                }
            }
        },

        renderCalendar() {
            this.els.calMonthTitle.textContent = `${AppState.calendarYear}년 ${AppState.calendarMonth}월`;
            this.els.calDetailPanel.style.display = 'none';

            const year = AppState.calendarYear;
            const month = AppState.calendarMonth;

            const firstDay = new Date(year, month - 1, 1).getDay();
            const daysInMonth = new Date(year, month, 0).getDate();

            // Monthly Summary
            const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
            const monthRecs = AppState.records.filter(r => r.date.startsWith(monthPrefix));
            if (monthRecs.length > 0) {
                const avg = monthRecs.reduce((sum, r) => sum + r.sleepHours, 0) / monthRecs.length;
                const highCount = monthRecs.filter(r => r.sleepHours >= 7.5).length;
                if (this.els.calMonthlySummary) {
                    this.els.calMonthlySummary.textContent = `이달 기록 ${monthRecs.length}일 · 평균 ${avg.toFixed(1)}시간 · 충분히 잔 날 ${highCount}일`;
                }
            } else {
                if (this.els.calMonthlySummary) {
                    this.els.calMonthlySummary.textContent = `이달 기록 0일 · 평균 0.0시간 · 충분히 잔 날 0일`;
                }
            }

            this.els.calGrid.innerHTML = '';
            
            for (let i = 0; i < firstDay; i++) {
                this.els.calGrid.innerHTML += `<div></div>`;
            }

            const today = new Date();
            const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
            const todayDate = today.getDate();

            for (let i = 1; i <= daysInMonth; i++) {
                const dStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const exist = AppState.records.find(r => r.date === dStr);
                
                let stateClass = 'cal-state-empty';
                if (exist) {
                    if (exist.sleepHours < 6) stateClass = 'cal-state-low';
                    else if (exist.sleepHours < 7.5) stateClass = 'cal-state-mid';
                    else stateClass = 'cal-state-high';
                }

                let todayClass = (isCurrentMonth && i === todayDate) ? 'today' : '';
                
                const cell = document.createElement('div');
                cell.className = `calendar-cell ${stateClass} ${todayClass}`;
                cell.textContent = i;
                cell.dataset.date = dStr;
                
                cell.addEventListener('click', () => {
                    this.els.calGrid.querySelectorAll('.calendar-cell').forEach(el => el.classList.remove('selected'));
                    cell.classList.add('selected');

                    if (exist) {
                        this.showCalendarDetail(exist);
                    } else {
                        if (dStr > getLocalDateString()) {
                            alert("미래 날짜는 기록할 수 없습니다.");
                            return;
                        }
                        AppState.selectedDateStr = dStr;
                        this.switchView('view-input');
                    }
                });

                this.els.calGrid.appendChild(cell);
            }
        },

        showCalendarDetail(rec) {
            this.els.calDetailPanel.style.display = 'block';
            this.els.calDetailDate.textContent = formatKoreanDate(rec.date);
            const emojiMap = {1:'😳', 2:'😐', 3:'🙂', 4:'😄', 5:'🤩'};
            this.els.calDetailCond.textContent = emojiMap[rec.condition] || '😐';
            this.els.calDetailSleep.textContent = `${rec.sleepTime.slice(0, 5)} ~ ${rec.wakeTime.slice(0, 5)} (${rec.sleepHours}시간)`;
            this.els.calDetailPhone.textContent = `${rec.phoneMinutes}분`;
            
            this.els.btnEditCalRec.onclick = () => {
                AppState.selectedDateStr = rec.date;
                this.switchView('view-input');
            };
        },

        bindEvents() {
            // Auth Events
            if (this.els.btnGoogleLogin) {
                this.els.btnGoogleLogin.addEventListener('click', async () => {
                    const { data, error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                            redirectTo: window.location.origin + window.location.pathname
                        }
                    });
                    if (error) console.error("Login error:", error.message);
                });
            }

            if (this.els.btnLogout) {
                this.els.btnLogout.addEventListener('click', async () => {
                    const { error } = await supabase.auth.signOut();
                    if (error) console.error("Logout error:", error.message);
                });
            }

            // Nav
            this.els.navBtns['view-input'].addEventListener('click', () => this.switchView('view-input'));
            this.els.navBtns['view-analysis'].addEventListener('click', () => this.switchView('view-analysis'));
            this.els.navBtns['view-mission'].addEventListener('click', () => this.switchView('view-mission'));
            this.els.navBtns['view-calendar'].addEventListener('click', () => this.switchView('view-calendar'));

            // Toggle score detail view
            const btnScoreToggle = document.getElementById('btn-toggle-score-detail');
            const contentScoreDetail = document.getElementById('score-detail-content');
            const iconScoreToggle = document.getElementById('icon-score-detail-toggle');
            if (btnScoreToggle && contentScoreDetail) {
                btnScoreToggle.addEventListener('click', () => {
                    const isHidden = contentScoreDetail.style.display === 'none';
                    if (isHidden) {
                        contentScoreDetail.style.display = 'block';
                        iconScoreToggle.style.transform = 'rotate(180deg)';
                    } else {
                        contentScoreDetail.style.display = 'none';
                        iconScoreToggle.style.transform = 'rotate(0deg)';
                    }
                });
            }

            // Refresh AI Comment
            if (this.els.btnRefreshComment) {
                this.els.btnRefreshComment.addEventListener('click', () => {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith("sc_comment_")) {
                            localStorage.removeItem(k);
                            i--; // 항목이 삭제되었으므로 인덱스 보정
                        }
                    }
                    this.updateAnalysisView();
                });
            }

            // Calendar Navigation
            if (this.els.btnPrevMonth) {
                this.els.btnPrevMonth.addEventListener('click', () => {
                    AppState.calendarMonth--;
                    if (AppState.calendarMonth < 1) {
                        AppState.calendarMonth = 12;
                        AppState.calendarYear--;
                    }
                    this.renderCalendar();
                });
                this.els.btnNextMonth.addEventListener('click', () => {
                    AppState.calendarMonth++;
                    if (AppState.calendarMonth > 12) {
                        AppState.calendarMonth = 1;
                        AppState.calendarYear++;
                    }
                    this.renderCalendar();
                });
            }

            // Date Picker
            if (this.els.datePicker) {
                // 투명한 input을 클릭했을 때 어디를 누르든(텍스트 부분 포함) 강제로 달력 팝업 띄우기
                this.els.datePicker.addEventListener('click', (e) => {
                    try {
                        if (e.target.showPicker) e.target.showPicker();
                    } catch (err) {
                        // 이미 열려있거나 지원하지 않는 경우 무시
                    }
                });

                this.els.datePicker.addEventListener('change', (e) => {
                    const selected = e.target.value;
                    if (!selected) return; // 날짜 선택 취소 시 무시

                    const today = getLocalDateString();
                    if (selected > today) {
                        alert("미래 날짜는 선택할 수 없습니다.");
                        e.target.value = AppState.selectedDateStr;
                        return;
                    }
                    AppState.selectedDateStr = selected;
                    this.updateInputView();
                });
            }

            // Slider
            this.els.inPhone.addEventListener('input', () => this.updateSliderUI());

            // Emojis
            this.els.ratingBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    AppState.selectedCondition = Number(btn.dataset.value);
                    this.updateEmojiUI();
                    this.checkFormValidity();
                });
            });

            // Sleepy Toggle
            if (this.els.inSleepy) {
                this.els.inSleepy.addEventListener('change', (e) => {
                    AppState.selectedSleepy = e.target.checked;
                });
            }

            // Form Submit
            this.els.form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const sleepVal = this.els.inSleep.value;
                const wakeVal = this.els.inWake.value;
                
                if (sleepVal === wakeVal) {
                    if (!confirm("수면 시간과 기상 시간이 같습니다. 정말 저장하시겠습니까?")) return;
                }
                
                const sh = calculateSleepHours(sleepVal, wakeVal);
                
                if (sh > 14) {
                    if (!confirm(`수면 시간이 ${sh}시간으로 너무 깁니다. 정말 저장하시겠습니까?`)) return;
                }
                
                const rec = {
                    date: AppState.selectedDateStr,
                    sleepTime: sleepVal,
                    wakeTime: wakeVal,
                    sleepHours: sh,
                    phoneMinutes: Number(this.els.inPhone.value),
                    condition: AppState.selectedCondition,
                    daySleepy: AppState.selectedSleepy
                };

                const idx = AppState.records.findIndex(r => r.date === rec.date);
                if (idx >= 0) AppState.records[idx] = rec;
                else AppState.records.push(rec);

                if (AppState.isLoggedIn) {
                    await DBService.saveRecord(rec);
                } else {
                    StorageDB.saveRecords();
                }
                
                // 어떤 날짜의 기록이든 수정/저장 시, 기존 캐시(오늘 포함)를 전부 날려서 가장 최신 분석을 받도록 강제
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith("sc_comment_")) {
                        localStorage.removeItem(k);
                        i--; // 항목이 삭제되었으므로 인덱스 보정
                    }
                }
                
                this.switchView('view-analysis');
            });

            // Mission Complete
            this.els.btnCompleteM.addEventListener('click', () => {
                const tm = AppState.missions.find(m => m.date === AppState.todayDateStr);
                if (tm) {
                    tm.done = true;
                    StorageDB.saveMissions();
                    this.updateMissionView();
                }
            });

            // Settings Bubble
            this.els.btnSettings.addEventListener('click', () => {
                this.els.bubble.classList.toggle('active');
            });
            document.addEventListener('click', (e) => {
                if(!this.els.btnSettings.contains(e.target) && !this.els.bubble.contains(e.target)) {
                    this.els.bubble.classList.remove('active');
                }
            });

            // Reset
            document.getElementById('btn-reset-data').addEventListener('click', async () => {
                if(confirm('전체 데이터를 삭제하시겠습니까?')) {
                    if (AppState.isLoggedIn) {
                        await supabase.from('records').delete().neq('date', '');
                    }
                    StorageDB.clearAll();
                    this.els.bubble.classList.remove('active');
                    this.updateInputView();
                    this.switchView('view-input');
                }
            });
        }
    };

    // Auth State change listener
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            AppState.isLoggedIn = true;
            UI.els.btnGoogleLogin.style.display = 'none';
            UI.els.userProfile.style.display = 'flex';
            UI.els.userName.textContent = session.user.user_metadata.full_name || session.user.email.split('@')[0];
            if (session.user.user_metadata.avatar_url) {
                UI.els.userAvatar.src = session.user.user_metadata.avatar_url;
            } else {
                UI.els.userAvatar.src = 'https://via.placeholder.com/24';
            }
            
            // 로그인 세션 초기 로드 시
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                await DBService.migrateLocalRecords();
                await DBService.loadRecords();
                UI.updateInputView();
                if (AppState.currentView === 'view-analysis') UI.updateAnalysisView();
            }
        } else {
            AppState.isLoggedIn = false;
            UI.els.btnGoogleLogin.style.display = 'flex';
            UI.els.userProfile.style.display = 'none';
            UI.els.userName.textContent = '';
            UI.els.userAvatar.src = '';
            
            // 비로그인 상태면 로컬 데이터 불러오기
            StorageDB.loadAll();
            UI.updateInputView();
        }
    });

    // Bootstrap
    StorageDB.loadAll();
    UI.init();
});
