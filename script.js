/**
 * SleepCoach (잠코치) - Premium App Logic
 * Version: v2.0 (Refactored & Modularized)
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
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const d = new Date(dateStr);
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
        if (mins === 0) return "0분 (매우 좋음)";
        if (mins < 60) return `${mins}분`;
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${mins}분 (${hrs}시간 ${m}분)` : `${mins}분 (${hrs}시간)`;
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
            localStorage.removeItem('sleepcoach_api_key');
            AppState.records = [];
            AppState.missions = [];
            
            // Clear comment caches
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
            
            // Get last 7 days
            const recent = [...records].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-7);
            const count = recent.length;

            const avgSleep = recent.reduce((sum, r) => sum + r.sleepHours, 0) / count;
            const avgPhone = recent.reduce((sum, r) => sum + r.phoneMinutes, 0) / count;
            const avgCondition = recent.reduce((sum, r) => sum + r.condition, 0) / count;

            const patterns = [];

            // 1. Sleep Short (< 8 hours)
            if (avgSleep < 8.0) {
                patterns.push({
                    id: 'sleep_short', type: 'warn', priority: 1,
                    msg: `이번 주 권장 수면시간(8시간)보다 평균 ${(8.0 - avgSleep).toFixed(1)}시간 부족해요.`
                });
            }

            // 2. Phone vs Condition
            const phoneArr = recent.map(r => r.phoneMinutes).sort((a,b)=>a-b);
            const medianPhone = phoneArr[Math.floor(count/2)];
            const highPhone = recent.filter(r => r.phoneMinutes > medianPhone);
            const lowPhone = recent.filter(r => r.phoneMinutes <= medianPhone);
            
            if (highPhone.length > 0 && lowPhone.length > 0) {
                const condH = highPhone.reduce((sum, r) => sum + r.condition, 0) / highPhone.length;
                const condL = lowPhone.reduce((sum, r) => sum + r.condition, 0) / lowPhone.length;
                if (condL - condH >= 1.0) {
                    patterns.push({
                        id: 'phone_condition', type: 'alert', priority: 2,
                        msg: `자기 전 폰을 오래 본 날 컨디션이 평균 ${(condL-condH).toFixed(1)}점이나 낮았어요.`
                    });
                }
            }

            // 3. Sleep Irregularity (StdDev >= 60mins)
            const sleepMins = recent.map(r => timeToMinutesContinuous(r.sleepTime));
            const meanMins = sleepMins.reduce((s,v)=>s+v, 0)/count;
            const stdDev = Math.sqrt(sleepMins.reduce((s,v)=>s+Math.pow(v-meanMins,2), 0)/count);
            if (stdDev >= 60) {
                patterns.push({
                    id: 'sleep_irregular', type: 'warn', priority: 3,
                    msg: `자는 시간이 매일 들쭉날쭉해요. (취침 시간 오차 평균 ${Math.round(stdDev)}분)`
                });
            }

            // 4. Day Sleepy Ratio (>= 50%)
            const sleepyCount = recent.filter(r => r.daySleepy).length;
            if (sleepyCount / count >= 0.5) {
                patterns.push({
                    id: 'day_sleepy', type: 'alert', priority: 4,
                    msg: `이번 주 절반 이상, 낮에 심하게 졸음을 느꼈어요.`
                });
            }

            patterns.sort((a,b) => a.priority - b.priority);

            return {
                avgSleep: avgSleep.toFixed(1),
                avgPhone: Math.round(avgPhone),
                avgCondition: avgCondition.toFixed(1),
                patterns: patterns.slice(0, 2)
            };
        },

        getMissionText(patternId) {
            const map = {
                sleep_short: "오늘은 평소보다 30분만 일찍 불 끄고 눈 감기",
                phone_condition: "오늘은 밤 11시 전에 스마트폰을 충전기에 꽂아두기",
                sleep_irregular: "오늘 밤에는 어제와 비슷한 시각에 누워보기",
                day_sleepy: "점심 식사 후 가볍게 10분 동안 산책하며 햇빛 쐬기"
            };
            return map[patternId] || "오늘도 푹 자기! 잠들기 전 가벼운 스트레칭 한 번 하기";
        },

        async getAiComment(result) {
            const key = StorageDB.getApiKey();
            const topPat = result.patterns[0];
            const patId = topPat ? topPat.id : "positive";

            if (key) {
                try {
                    const info = `평균 수면: ${result.avgSleep}시간, 폰 사용: ${result.avgPhone}분, 평균 컨디션: ${result.avgCondition}점. 주요 패턴: ${topPat ? topPat.msg : "아주 좋음"}`;
                    const prompt = `너는 청소년 수면 코치 '올리'야. 다음 데이터를 보고 친근하고 다정한 반말로 조언해줘. 절대 혼내지 말고 2~3문장으로 짧게 핵심만 짚어줘: ${info}`;
                    
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

            // Fallback
            const fallbacks = {
                sleep_short: `요즘 많이 바빴나봐, 평균 수면이 ${result.avgSleep}시간으로 좀 부족해. 피로가 쌓이면 몸이 무거우니까 오늘은 딱 30분만 일찍 불 끄자! 올리가 응원할게.`,
                phone_condition: `폰 오래 본 날 아침이 더 피곤한 거 보이지? 자기 전 스마트폰 빛이 수면 호르몬을 방해해서 그래. 오늘은 폰을 멀리 두고 자볼까? 내일 훨씬 상쾌할 거야!`,
                sleep_irregular: `자는 시간이 매일 다르면 우리 몸은 매일 시차 적응하는 것처럼 힘들대. 주말이라도 비슷한 시간에 눕는 연습을 해보자. 규칙적인 생활이 피로 회복의 핵심이야!`,
                day_sleepy: `낮에 자꾸 졸린 건 밤잠의 깊이가 얕거나 부족했다는 몸의 신호야. 억지로 참기 힘들었지? 오늘 밤엔 일찍 스마트폰 덮고 푹 자보자. 활기찬 널 보고 싶어!`,
                positive: `와! 이번 주 수면 패턴 너무 훌륭해! 잠도 충분히 자고 규칙적이라 컨디션도 좋은 게 눈에 보여. 지금 이 좋은 습관을 쭉 유지해 줘. 너무 멋져!`
            };
            return fallbacks[patId] || fallbacks.positive;
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
            prevHrs: document.getElementById('preview-hours'),
            inPhone: document.getElementById('input-phone-time'),
            phoneDisp: document.getElementById('phone-time-display'),
            ratingBtns: document.querySelectorAll('.rating-btn'),
            inSleepy: document.getElementById('input-day-sleepy'),
            btnSave: document.getElementById('btn-save-record'),
            
            navInput: document.getElementById('nav-btn-input'),
            navData: document.getElementById('nav-btn-data'),
            viewInput: document.getElementById('view-input'),
            viewData: document.getElementById('view-data'),

            lockedState: document.getElementById('analysis-locked'),
            unlockedState: document.getElementById('analysis-unlocked'),
            lockDays: document.getElementById('locked-needed-days'),
            lockFill: document.getElementById('locked-progress-fill'),
            lockText: document.getElementById('locked-progress-text'),

            statSleep: document.getElementById('stat-avg-sleep'),
            statPhone: document.getElementById('stat-avg-phone'),
            statCond: document.getElementById('stat-avg-condition'),
            patternsList: document.getElementById('patterns-list'),
            aiComment: document.getElementById('ai-comment-text'),
            
            missionText: document.getElementById('mission-text'),
            btnCompleteM: document.getElementById('btn-complete-mission'),
            missionDone: document.getElementById('mission-done-state')
        },

        init() {
            this.bindEvents();
            this.updateInputView();
        },

        switchView(target) {
            if (AppState.currentView === target) return;
            
            if (target === 'view-input') {
                this.els.navInput.classList.add('active');
                this.els.navData.classList.remove('active');
                this.updateInputView();
            } else {
                this.els.navData.classList.add('active');
                this.els.navInput.classList.remove('active');
                this.updateDashboardView();
            }

            const curr = document.getElementById(AppState.currentView);
            const next = document.getElementById(target);
            
            curr.classList.remove('active');
            next.classList.add('active');
            AppState.currentView = target;
        },

        updateInputView() {
            this.els.dateBadge.textContent = formatKoreanDate(AppState.todayDateStr);
            const exist = AppState.records.find(r => r.date === AppState.todayDateStr);
            
            if (exist) {
                AppState.isEditMode = true;
                this.els.inSleep.value = exist.sleepTime;
                this.els.inWake.value = exist.wakeTime;
                this.els.inPhone.value = exist.phoneMinutes;
                this.els.phoneDisp.textContent = formatPhoneMinutes(exist.phoneMinutes);
                this.els.inSleepy.checked = exist.daySleepy;
                
                AppState.selectedCondition = exist.condition;
                this.els.ratingBtns.forEach(b => {
                    b.classList.toggle('active', parseInt(b.dataset.value) === exist.condition);
                });

                document.querySelector('.view-title').textContent = "오늘의 기록 수정";
                this.els.btnSave.querySelector('span').textContent = "수정 완료하고 AI 분석 보기";
                this.els.btnSave.disabled = false;
            } else {
                AppState.isEditMode = false;
                this.els.inSleep.value = "23:00";
                this.els.inWake.value = "07:00";
                this.els.inPhone.value = "60";
                this.els.phoneDisp.textContent = "60분";
                this.els.inSleepy.checked = false;
                
                AppState.selectedCondition = null;
                this.els.ratingBtns.forEach(b => b.classList.remove('active'));

                document.querySelector('.view-title').textContent = "오늘의 수면 기록";
                this.els.btnSave.querySelector('span').textContent = "기록 저장하고 AI 분석 보기";
                this.els.btnSave.disabled = true;
            }
            this.updateHoursPreview();
        },

        updateHoursPreview() {
            const h = calculateSleepHours(this.els.inSleep.value, this.els.inWake.value);
            this.els.prevHrs.textContent = h.toFixed(1);
        },

        async updateDashboardView() {
            const recs = AppState.records;
            if (recs.length < 3) {
                this.els.lockedState.style.display = 'flex';
                this.els.unlockedState.style.display = 'none';
                this.els.lockDays.textContent = 3 - recs.length;
                this.els.lockFill.style.width = \`\${(recs.length / 3) * 100}%\`;
                this.els.lockText.textContent = \`\${recs.length}/3일 기록 완료\`;
                return;
            }

            this.els.lockedState.style.display = 'none';
            this.els.unlockedState.style.display = 'flex';

            const res = Analyzer.analyze(recs);
            this.els.statSleep.textContent = \`\${res.avgSleep}h\`;
            this.els.statPhone.textContent = \`\${res.avgPhone}m\`;
            this.els.statCond.textContent = \`\${res.avgCondition}점\`;

            // Render Patterns
            this.els.patternsList.innerHTML = '';
            if (res.patterns.length === 0) {
                this.els.patternsList.innerHTML = \`
                    <div class="pattern-item">
                        <div class="pattern-icon good"><i class="fa-solid fa-face-smile"></i></div>
                        <div class="pattern-text">이번 주는 특별히 우려되는 패턴이 없어요! 훌륭합니다.</div>
                    </div>\`;
            } else {
                res.patterns.forEach(p => {
                    let ic = "fa-solid fa-circle-exclamation";
                    if(p.id==='sleep_short') ic = "fa-solid fa-bed";
                    if(p.id==='phone_condition') ic = "fa-solid fa-mobile";
                    if(p.id==='sleep_irregular') ic = "fa-solid fa-clock-rotate-left";
                    
                    this.els.patternsList.innerHTML += \`
                    <div class="pattern-item">
                        <div class="pattern-icon \${p.type}"><i class="\${ic}"></i></div>
                        <div class="pattern-text">\${p.msg}</div>
                    </div>\`;
                });
            }

            // Mission
            const patId = res.patterns[0] ? res.patterns[0].id : 'positive';
            const mText = Analyzer.getMissionText(patId);
            
            let todayMiss = AppState.missions.find(m => m.date === AppState.todayDateStr);
            if (!todayMiss) {
                todayMiss = { date: AppState.todayDateStr, type: patId, text: mText, done: false };
                AppState.missions.push(todayMiss);
                StorageDB.saveMissions();
            }

            this.els.missionText.textContent = todayMiss.text;
            if (todayMiss.done) {
                this.els.btnCompleteM.style.display = 'none';
                this.els.missionDone.style.display = 'flex';
            } else {
                this.els.btnCompleteM.style.display = 'flex';
                this.els.missionDone.style.display = 'none';
            }

            // AI Comment Cache
            const cKey = \`sc_comment_\${AppState.todayDateStr}\`;
            const cached = localStorage.getItem(cKey);
            if (cached) {
                this.els.aiComment.textContent = cached;
            } else {
                this.els.aiComment.innerHTML = \`<div class="loading-msg"><i class="fa-solid fa-circle-notch fa-spin"></i> 데이터를 분석 중이에요...</div>\`;
                const cmt = await Analyzer.getAiComment(res);
                localStorage.setItem(cKey, cmt);
                this.els.aiComment.textContent = cmt;
            }
        },

        bindEvents() {
            this.els.navInput.addEventListener('click', () => this.switchView('view-input'));
            this.els.navData.addEventListener('click', () => this.switchView('view-data'));
            document.getElementById('btn-go-record').addEventListener('click', () => this.switchView('view-input'));

            this.els.inSleep.addEventListener('input', () => this.updateHoursPreview());
            this.els.inWake.addEventListener('input', () => this.updateHoursPreview());
            
            this.els.inPhone.addEventListener('input', (e) => {
                this.els.phoneDisp.textContent = formatPhoneMinutes(Number(e.target.value));
            });

            this.els.ratingBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.els.ratingBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    AppState.selectedCondition = Number(btn.dataset.value);
                    this.els.btnSave.disabled = false;
                });
            });

            this.els.form.addEventListener('submit', (e) => {
                e.preventDefault();
                const sh = calculateSleepHours(this.els.inSleep.value, this.els.inWake.value);
                if (sh === 0) { alert("입력된 시간이 이상합니다. 다시 확인해주세요."); return; }
                if (sh > 14) {
                    if(!confirm(\`수면 시간이 \${sh}시간으로 너무 깁니다. 이대로 저장할까요?\`)) return;
                }

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
                localStorage.removeItem(\`sc_comment_\${rec.date}\`); // invalidate cache
                
                this.switchView('view-data');
            });

            this.els.btnCompleteM.addEventListener('click', () => {
                const tm = AppState.missions.find(m => m.date === AppState.todayDateStr);
                if (tm) {
                    tm.done = true;
                    StorageDB.saveMissions();
                    this.els.btnCompleteM.style.display = 'none';
                    this.els.missionDone.style.display = 'flex';
                    this.triggerConfetti();
                }
            });

            // Settings Modal
            const modal = document.getElementById('settings-modal');
            document.getElementById('btn-settings').addEventListener('click', () => {
                document.getElementById('input-api-key').value = StorageDB.getApiKey();
                document.getElementById('api-key-status').textContent = '';
                modal.classList.add('active');
            });
            document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('active'));

            document.getElementById('btn-save-api-key').addEventListener('click', () => {
                const k = document.getElementById('input-api-key').value.trim();
                StorageDB.saveApiKey(k);
                localStorage.removeItem(\`sc_comment_\${AppState.todayDateStr}\`);
                document.getElementById('api-key-status').textContent = k ? '저장됨' : '삭제됨';
            });

            const seedHandler = () => {
                StorageDB.clearAll();
                const templates = [
                    {s:"01:30", w:"07:00", p:120, c:2, dy:true},
                    {s:"23:00", w:"07:00", p:30,  c:4, dy:false},
                    {s:"02:00", w:"07:30", p:180, c:1, dy:true},
                    {s:"23:30", w:"07:00", p:50,  c:3, dy:false},
                    {s:"00:30", w:"08:00", p:90,  c:3, dy:true},
                    {s:"02:10", w:"07:00", p:150, c:2, dy:true},
                    {s:"23:00", w:"06:30", p:40,  c:4, dy:false}
                ];
                
                const d = new Date();
                templates.forEach((t, i) => {
                    const pd = new Date(d);
                    pd.setDate(d.getDate() - (7 - i));
                    AppState.records.push({
                        date: getLocalDateString(pd),
                        sleepTime: t.s, wakeTime: t.w,
                        sleepHours: calculateSleepHours(t.s, t.w),
                        phoneMinutes: t.p, condition: t.c, daySleepy: t.dy
                    });
                });
                StorageDB.saveRecords();
                this.updateInputView();
                modal.classList.remove('active');
                this.switchView('view-data');
            };
            document.getElementById('btn-load-seed').addEventListener('click', seedHandler);
            document.getElementById('btn-load-seed-locked').addEventListener('click', seedHandler);

            document.getElementById('btn-reset-data').addEventListener('click', () => {
                if(confirm('전체 데이터를 삭제하시겠습니까?')) {
                    StorageDB.clearAll();
                    modal.classList.remove('active');
                    this.updateInputView();
                    this.switchView('view-input');
                }
            });
        },

        triggerConfetti() {
            const wrap = document.getElementById('mission-container');
            for(let i=0; i<30; i++) {
                const c = document.createElement('div');
                c.className = 'confetti-piece';
                const cols = ['#2dd4bf', '#fbbf24', '#818cf8', '#c084fc', '#fb7185'];
                c.style.background = cols[Math.floor(Math.random()*cols.length)];
                c.style.borderRadius = Math.random()>0.5 ? '50%' : '0';
                wrap.appendChild(c);

                const ang = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 80;
                c.animate([
                    { transform: 'translate(0,0) scale(1)', opacity:1 },
                    { transform: \`translate(\${Math.cos(ang)*dist}px, \${Math.sin(ang)*dist}px) scale(0)\`, opacity:0 }
                ], { duration: 600 + Math.random()*400, easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' });
                setTimeout(()=>c.remove(), 1000);
            }
        }
    };

    // Bootstrap
    StorageDB.loadAll();
    UI.init();
});
