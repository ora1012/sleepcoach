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
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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
            let missionType = null;

            // Rule 1: Sleep Duration
            if (avgSleep < 8.0) {
                patterns.push(`주중에 권장보다<br><strong>${(8.0 - avgSleep).toFixed(1)}시간</strong><br>부족해요`);
                if (!missionType) missionType = 'sleep_short';
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
                    if (!missionType) missionType = 'phone_high';
                }
            }

            // Rule 3: Irregular sleep
            if (stdDev >= 60) {
                patterns.push(`자는 시간이<br>매일 <strong>들쭉날쭉해요</strong>`);
                if (!missionType) missionType = 'sleep_irregular';
            }

            // Rule 4: Day sleepy
            if (daySleepyRatio >= 0.5) {
                patterns.push(`이번 주 <strong>절반 이상</strong><br>낮에 졸렸어요`);
                if (!missionType) missionType = 'day_sleepy';
            }
            
            // Add positive patterns if we don't have enough patterns
            if (patterns.length === 0) {
                patterns.push(`이번 주는<br>권장 수면시간을<br><strong>잘 채웠어요!</strong>`);
                patterns.push(`폰 사용 시간이<br><strong>일정하게</strong><br>유지되고 있어요`);
            } else if (patterns.length === 1) {
                if (avgSleep >= 8.0) patterns.push(`이번 주는<br>권장 수면시간을<br><strong>잘 채웠어요!</strong>`);
                else patterns.push(`폰 사용 시간이<br><strong>일정하게</strong><br>유지되고 있어요`);
            }

            const score = this.calculateScore(recent);

            return {
                avgSleep: avgSleep,
                avgPhone: avgPhone,
                avgCondition: avgCondition,
                patterns: patterns.slice(0, 2),
                missionType: missionType || 'positive',
                score: score
            };
        },

        calculateScore(recent) {
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
            if (stdDev <= 60) regScore = 30;
            else if (stdDev <= 120) regScore = 25;
            else if (stdDev <= 180) regScore = 15;
            else regScore = 10;
            
            // 3. Phone Usage (Max 30)
            let phoneScore = 0;
            if (avgPhone <= 30) phoneScore = 30;
            else if (avgPhone <= 60) phoneScore = 25;
            else if (avgPhone <= 120) phoneScore = 15;
            else phoneScore = 10;
            
            return sleepScore + regScore + phoneScore;
        },

        getMissionText(type) {
            const map = {
                sleep_short: "오늘은 평소보다 30분 일찍 누워보기",
                phone_high: "오늘은 11시 전에 폰을 충전기에 꽂아두기",
                sleep_irregular: "오늘은 어제와 같은 시각에 누워보기",
                day_sleepy: "점심 후 10분 가벼운 산책하기",
                positive: "오늘도 이대로 푹 자기! 가벼운 스트레칭 추천해요"
            };
            return map[type] || map.positive;
        },

        async getAiComment(result) {
            try {
                const info = `평균 수면: ${result.avgSleep.toFixed(1)}시간, 폰 사용: ${Math.round(result.avgPhone)}분`;
                const prompt = `수면 코치로서 다정한 반말로 2문장 짧게 조언해줘 (매번 조금씩 다른 표현으로 말해줘): ${info}`;
                
                // Cloudflare Worker API Endpoint
                const workerUrl = "https://sleepcoach.ora111012.workers.dev/"; 
                
                const res = await fetch(workerUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: prompt })
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
                // Fallback comment
                return `요즘 조금 늦게 자는 날이 많았네요. 오늘은 완벽하게 하려고 하기보다, 폰을 10분만 일찍 내려놓는 것부터 해봐요. 그 정도면 충분히 잘하고 있어요.`;
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
            lockFill: document.getElementById('locked-progress-fill'),
            statAvgSleep: document.getElementById('stat-avg-sleep'),
            patternsList: document.getElementById('patterns-list'),
            aiComment: document.getElementById('ai-comment-text'),
            btnRefreshComment: document.getElementById('btn-refresh-comment'),

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
                this.els.inSleepy.checked = exist.daySleepy;
                AppState.selectedCondition = exist.condition;
                this.els.btnSave.disabled = false;
            } else {
                AppState.isEditMode = false;
                this.els.inSleep.value = "23:20";
                this.els.inWake.value = "07:00";
                this.els.inPhone.value = "90";
                this.els.inSleepy.checked = false;
                AppState.selectedCondition = null;
                this.els.btnSave.disabled = true;
            }

            this.updateSliderUI();
            this.updateEmojiUI();
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
            const hrs = Math.floor(res.avgSleep);
            const mins = Math.round((res.avgSleep - hrs) * 60);
            
            const scoreEl = document.getElementById('stat-sleep-score');
            if(scoreEl) scoreEl.textContent = `${res.score}점`;
            
            this.els.statAvgSleep.innerHTML = `${hrs}시간 ${mins > 0 ? mins+'분' : ''}`;

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
                StorageDB.saveMissions();
            }

            // AI Comment Cache
            const cKey = `sc_comment_${AppState.todayDateStr}`;
            const cached = localStorage.getItem(cKey);
            if (cached) {
                this.els.aiComment.textContent = cached;
                this.els.aiComment.classList.remove('loading');
            } else {
                this.els.aiComment.textContent = "AI가 분석 중입니다...";
                this.els.aiComment.classList.add('loading');
                const cmt = await Analyzer.getAiComment(res);
                localStorage.setItem(cKey, cmt);
                this.els.aiComment.textContent = cmt;
                this.els.aiComment.classList.remove('loading');
            }
        },

        updateMissionView() {
            const todayMiss = AppState.missions.find(m => m.date === AppState.todayDateStr);
            if (!todayMiss) {
                this.els.missionText.textContent = "아직 분석 데이터가 부족하여 미션이 없습니다.";
                this.els.btnCompleteM.style.display = 'none';
                return;
            }

            this.els.missionText.textContent = todayMiss.text;
            if (todayMiss.done) {
                this.els.missionActive.style.display = 'none';
                this.els.missionDone.style.display = 'block';
            } else {
                this.els.missionActive.style.display = 'block';
                this.els.missionDone.style.display = 'none';
                this.els.btnCompleteM.style.display = 'block';
            }
        },

        renderCalendar() {
            this.els.calMonthTitle.textContent = `${AppState.calendarYear}년 ${AppState.calendarMonth}월`;
            this.els.calDetailPanel.style.display = 'none';

            const year = AppState.calendarYear;
            const month = AppState.calendarMonth;

            const firstDay = new Date(year, month - 1, 1).getDay();
            const daysInMonth = new Date(year, month, 0).getDate();

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
            this.els.calDetailSleep.textContent = `${rec.sleepTime} ~ ${rec.wakeTime} (${rec.sleepHours}시간)`;
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

            // Refresh AI Comment
            if (this.els.btnRefreshComment) {
                this.els.btnRefreshComment.addEventListener('click', () => {
                    localStorage.removeItem(`sc_comment_${AppState.todayDateStr}`);
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
                    this.els.btnSave.disabled = false;
                });
            });

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
                    daySleepy: this.els.inSleepy.checked
                };

                const idx = AppState.records.findIndex(r => r.date === rec.date);
                if (idx >= 0) AppState.records[idx] = rec;
                else AppState.records.push(rec);

                if (AppState.isLoggedIn) {
                    await DBService.saveRecord(rec);
                } else {
                    StorageDB.saveRecords();
                }
                
                // 해당 기록 날짜의 코멘트 캐시 삭제
                localStorage.removeItem(`sc_comment_${rec.date}`);
                // 어떤 날짜의 기록을 수정하든 '오늘'의 AI 코멘트 캐시도 지워서 분석 화면에서 새로고침되도록 함
                if (rec.date !== AppState.todayDateStr) {
                    localStorage.removeItem(`sc_comment_${AppState.todayDateStr}`);
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
