/**
 * SleepCoach (잠코치) - UI Refresh v3.0
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // 1. STATE MANAGEMENT
    // =========================================================================
    const AppState = {
        currentView: 'view-input',
        todayDateStr: getLocalDateString(),
        records: [],
        missions: [],
        selectedCondition: null,
        isEditMode: false
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
        getApiKey() { return localStorage.getItem('sleepcoach_api_key') || ''; },
        saveApiKey(k) { localStorage.setItem('sleepcoach_api_key', k); },
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

            const patterns = [];

            // Pattern 1: Sleep
            if (avgSleep < 8.0) {
                patterns.push(`주중에 권장보다<br><strong>${(8.0 - avgSleep).toFixed(1)}시간</strong><br>부족해요`);
            } else {
                patterns.push(`이번 주는<br>권장 수면시간을<br><strong>잘 채웠어요!</strong>`);
            }

            // Pattern 2: Phone/Condition
            const phoneArr = recent.map(r => r.phoneMinutes).sort((a,b)=>a-b);
            const medianPhone = phoneArr[Math.floor(count/2)];
            const highPhone = recent.filter(r => r.phoneMinutes > medianPhone);
            const lowPhone = recent.filter(r => r.phoneMinutes <= medianPhone);
            
            if (highPhone.length > 0 && lowPhone.length > 0) {
                const condH = highPhone.reduce((sum, r) => sum + r.condition, 0) / highPhone.length;
                const condL = lowPhone.reduce((sum, r) => sum + r.condition, 0) / lowPhone.length;
                if (condL - condH >= 1.0) {
                    patterns.push(`폰 사용이<br><strong>${medianPhone}분</strong> 넘은 날엔<br>컨디션이 낮았어요`);
                } else {
                    patterns.push(`스마트폰 사용이<br>컨디션에 큰<br>영향을 주지 않았어요`);
                }
            } else {
                patterns.push(`폰 사용 시간이<br><strong>일정하게</strong><br>유지되고 있어요`);
            }

            // Mission Selection
            let missionType = 'positive';
            if (avgSleep < 8.0) missionType = 'sleep_short';
            else if (avgPhone > 60) missionType = 'phone_high';

            return {
                avgSleep: avgSleep,
                avgPhone: avgPhone,
                avgCondition: avgCondition,
                patterns: patterns.slice(0, 2),
                missionType: missionType
            };
        },

        getMissionText(type) {
            const map = {
                sleep_short: "오늘은 평소보다 30분 일찍 누워보기",
                phone_high: "오늘은 11시 전에 폰을 충전기에 꽂아두기",
                positive: "오늘도 이대로 푹 자기! 가벼운 스트레칭 추천해요"
            };
            return map[type] || map.positive;
        },

        async getAiComment(result) {
            const key = StorageDB.getApiKey();
            if (key) {
                try {
                    const info = `평균 수면: ${result.avgSleep.toFixed(1)}시간, 폰 사용: ${Math.round(result.avgPhone)}분`;
                    const prompt = `수면 코치로서 다정한 반말로 2문장 짧게 조언해줘: ${info}`;
                    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    });
                    if (!res.ok) throw new Error("API Failed");
                    const data = await res.json();
                    return data.candidates[0].content.parts[0].text.trim();
                } catch (e) {
                    console.error(e);
                }
            }
            return `요즘 조금 늦게 자는 날이 많았네요. 오늘은 완벽하게 하려고 하기보다, 폰을 10분만 일찍 내려놓는 것부터 해봐요. 그 정도면 충분히 잘하고 있어요.`;
        }
    };

    // =========================================================================
    // 5. UI CONTROLLER MODULE
    // =========================================================================
    const UI = {
        els: {
            dateBadge: document.getElementById('current-date'),
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
                'view-mission': document.getElementById('nav-btn-mission')
            },
            
            views: {
                'view-input': document.getElementById('view-input'),
                'view-analysis': document.getElementById('view-analysis'),
                'view-mission': document.getElementById('view-mission')
            },

            // Settings
            btnSettings: document.getElementById('btn-settings-toggle'),
            bubble: document.getElementById('settings-bubble'),

            // Analysis
            analysisLocked: document.getElementById('analysis-locked'),
            analysisUnlocked: document.getElementById('analysis-unlocked'),
            lockFill: document.getElementById('locked-progress-fill'),
            statAvgSleep: document.getElementById('stat-avg-sleep'),
            patternsList: document.getElementById('patterns-list'),
            aiComment: document.getElementById('ai-comment-text'),

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
        },

        updateInputView() {
            this.els.dateBadge.textContent = formatKoreanDate(AppState.todayDateStr);
            const exist = AppState.records.find(r => r.date === AppState.todayDateStr);
            
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

        bindEvents() {
            // Nav
            this.els.navBtns['view-input'].addEventListener('click', () => this.switchView('view-input'));
            this.els.navBtns['view-analysis'].addEventListener('click', () => this.switchView('view-analysis'));
            this.els.navBtns['view-mission'].addEventListener('click', () => this.switchView('view-mission'));

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
            this.els.form.addEventListener('submit', (e) => {
                e.preventDefault();
                const sh = calculateSleepHours(this.els.inSleep.value, this.els.inWake.value);
                const rec = {
                    date: AppState.todayDateStr,
                    sleepTime: this.els.inSleep.value,
                    wakeTime: this.els.inWake.value,
                    sleepHours: sh,
                    phoneMinutes: Number(this.els.inPhone.value),
                    condition: AppState.selectedCondition,
                    daySleepy: this.els.inSleepy.checked
                };

                const idx = AppState.records.findIndex(r => r.date === rec.date);
                if (idx >= 0) AppState.records[idx] = rec;
                else AppState.records.push(rec);

                StorageDB.saveRecords();
                localStorage.removeItem(`sc_comment_${rec.date}`);
                
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

            // API Modal
            const modal = document.getElementById('settings-modal');
            document.getElementById('btn-open-api').addEventListener('click', () => {
                document.getElementById('input-api-key').value = StorageDB.getApiKey();
                modal.classList.add('active');
                this.els.bubble.classList.remove('active');
            });
            document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('active'));
            document.getElementById('btn-save-api-key').addEventListener('click', () => {
                StorageDB.saveApiKey(document.getElementById('input-api-key').value.trim());
                localStorage.removeItem(`sc_comment_${AppState.todayDateStr}`);
                modal.classList.remove('active');
            });

            // Reset
            document.getElementById('btn-reset-data').addEventListener('click', () => {
                if(confirm('전체 데이터를 삭제하시겠습니까?')) {
                    StorageDB.clearAll();
                    this.els.bubble.classList.remove('active');
                    this.updateInputView();
                    this.switchView('view-input');
                }
            });
        }
    };

    // Bootstrap
    StorageDB.loadAll();
    UI.init();
});
