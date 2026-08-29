// 잠코치 포트폴리오 → 노션 페이지 업로드 스크립트
// 사용법: node upload_to_notion.js

const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_VERSION = "2022-06-28";

// --- 헬퍼 함수 ---
function richText(content, opts = {}) {
  const annotations = {
    bold: opts.bold || false,
    italic: opts.italic || false,
    strikethrough: false,
    underline: false,
    code: opts.code || false,
    color: opts.color || "default",
  };
  const rt = {
    type: "text",
    text: { content },
    annotations,
  };
  if (opts.link) {
    rt.text.link = { url: opts.link };
  }
  return rt;
}

function heading1(text) {
  return {
    object: "block",
    type: "heading_1",
    heading_1: { rich_text: [richText(text)], color: "default" },
  };
}

function heading2(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [richText(text)], color: "default" },
  };
}

function heading3(text, richTexts) {
  return {
    object: "block",
    type: "heading_3",
    heading_3: { rich_text: richTexts || [richText(text)], color: "default" },
  };
}

function paragraph(texts) {
  if (typeof texts === "string") {
    texts = [richText(texts)];
  }
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: texts, color: "default" },
  };
}

function bulletItem(texts) {
  if (typeof texts === "string") {
    texts = [richText(texts)];
  }
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: texts, color: "default" },
  };
}

function divider() {
  return { object: "block", type: "divider", divider: {} };
}

function callout(text, emoji = "💡") {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: typeof text === "string" ? [richText(text)] : text,
      icon: { type: "emoji", emoji },
      color: "default",
    },
  };
}

function tableBlock(rows) {
  const width = rows[0].length;
  return {
    object: "block",
    type: "table",
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((row) => ({
        object: "block",
        type: "table_row",
        table_row: {
          cells: row.map((cell) => [richText(cell)]),
        },
      })),
    },
  };
}

function todoItem(text, checked = false) {
  return {
    object: "block",
    type: "to_do",
    to_do: {
      rich_text: typeof text === "string" ? [richText(text)] : text,
      checked,
      color: "default",
    },
  };
}

// --- API 호출 ---
async function notionFetch(path, method = "GET", body = null) {
  const url = `https://api.notion.com/v1${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API ${res.status}: ${err}`);
  }
  return res.json();
}

async function appendBlocks(blockId, children) {
  for (let i = 0; i < children.length; i += 100) {
    const chunk = children.slice(i, i + 100);
    await notionFetch(`/blocks/${blockId}/children`, "PATCH", {
      children: chunk,
    });
  }
}

// --- 기존 블록 삭제 ---
async function deleteAllBlocks(pageId) {
  const res = await notionFetch(
    `/blocks/${pageId}/children?page_size=100`
  );
  for (const block of res.results) {
    try {
      await notionFetch(`/blocks/${block.id}`, "DELETE");
    } catch (e) {}
  }
  return res.results.length;
}

// --- 포트폴리오 블록 구성 ---
function buildPortfolioBlocks() {
  const blocks = [];

  // === 한눈에 보기 ===
  blocks.push(heading1("📌 한눈에 보기"));
  blocks.push(
    tableBlock([
      ["항목", "내용"],
      ["프로젝트명", "잠코치 (SleepCoach)"],
      [
        "한 줄 소개",
        "청소년 수면·스마트폰 습관을 기록하고 AI가 분석해주는 웹앱",
      ],
      ["배포 링크", "https://ora1012.github.io/sleepcoach/"],
      ["GitHub", "github.com/ora1012/sleepcoach"],
      ["개발 기간", "2026.06 ~ (진행 중)"],
      [
        "사용 기술",
        "HTML/CSS/JS · Supabase(Auth+DB) · Cloudflare Workers · Gemini API",
      ],
      [
        "개발 방식",
        "기획·설계 직접 / 구현 AI(Antigravity) 활용 / 결과 이해·검수",
      ],
    ])
  );
  blocks.push(divider());

  // === 1. 왜 만들었나 ===
  blocks.push(heading1("① 왜 만들었나"));

  blocks.push(paragraph([richText("계기", { bold: true })]));
  blocks.push(
    paragraph(
      '밤에 스마트폰을 늦게까지 보다 잠이 부족한 채로 등교하는 날이 반복됐다. 피곤한 게 익숙해질수록 "이 정도면 괜찮겠지"라고 넘기게 되었고, 내 수면이 정말 부족한 건지 객관적으로 확인할 방법이 없었다.'
    )
  );

  blocks.push(paragraph([richText("조사", { bold: true })]));
  blocks.push(
    paragraph([
      richText(
        "조사해 보니 나만의 문제가 아니었다. 한국 청소년의 평균 수면 시간은 약 5.8시간으로 OECD 국가 중 최하위이고, 중학생 52%·고등학생 90%가 권장 시간(8~10시간)에 못 미친다. "
      ),
      richText(
        "그런데 정작 잠이 부족한 학생 중 35%만 스스로 '부족하다'고 인식한다.",
        { bold: true }
      ),
      richText(
        " 한편 청소년 스마트폰 과의존 위험군은 43.0%로 유일하게 증가 추세이고, 폰 사용 습관과 수면의 질은 서로 연결되어 있다."
      ),
    ])
  );

  blocks.push(paragraph([richText("제작", { bold: true })]));
  blocks.push(
    paragraph([
      richText(
        '"객관적으로 보여주는 도구가 없다면 내가 만들자." 매일 30초 만에 수면·폰 사용을 기록하면 AI가 내가 몰랐던 패턴을 짚어주고, 오늘 바꿀 수 있는 작은 습관 하나를 추천하는 웹앱 — '
      ),
      richText("잠코치", { bold: true }),
      richText("를 만들었다."),
    ])
  );
  blocks.push(divider());

  // === 2. 어떻게 기획했나 ===
  blocks.push(heading1("② 어떻게 기획했나"));

  blocks.push(
    callout("바로 코딩부터 한 게 아니라 기획서(PRD)와 기능명세서를 먼저 썼습니다. 중학생이 PRD를 쓰고 시작했다는 건 흔한 일이 아닙니다.", "📝")
  );

  blocks.push(paragraph([
    richText("코딩을 시작하기 전에 "),
    richText("PRD(제품 요구 문서)", { bold: true }),
    richText("와 "),
    richText("상세 기능 명세서", { bold: true }),
    richText("를 먼저 작성했습니다. 배경 조사 → 목표 설정 → 타깃 분석 → 사용자 시나리오 → 범위 정의 → AI 설계 → 리스크 대응까지 총 7개 항목으로 구성된 기획서를 완성한 뒤에야 코드를 한 줄도 쓰지 않았던 첫 구현에 들어갔습니다."),
  ]));

  // --- 뺀 기능 이야기 ---
  blocks.push(heading2("뺀 기능 이야기 — MVP 전략"));

  blocks.push(paragraph([
    richText("넣고 싶은 기능은 많았습니다. 하지만 기획서를 쓰면서 깨달은 게 있습니다. "),
    richText("\"욕심내면 미완성이 된다.\"", { bold: true }),
  ]));

  blocks.push(paragraph("그래서 기능을 세 단계로 나눴습니다."));

  blocks.push(bulletItem([
    richText("MVP (먼저 끝낸 것): ", { bold: true }),
    richText("데일리 기록, 패턴 분석, 오늘의 미션 — 이 세 개만 완벽하게 만들기로 했습니다."),
  ]));
  blocks.push(bulletItem([
    richText("2순위 (다음에 할 것): ", { bold: true }),
    richText("수면 점수, 주간 리포트, 상관관계 그래프, 미션 완료율 — 하고 싶지만 MVP가 끝난 뒤로 미뤘습니다."),
  ]));
  blocks.push(bulletItem([
    richText("범위 밖 (안 하기로 한 것): ", { bold: true }),
    richText("웨어러블 연동, 의료 진단, 타인 비교·랭킹, 알림 푸시 — 청소년 혼자 만들 수 있는 범위를 벗어나거나, 잠코치의 핵심 가치와 맞지 않아 과감히 뺐습니다."),
  ]));

  blocks.push(paragraph([
    richText("통합문서에도 적어뒀습니다: "),
    richText("\"⚠️ 한 번에 하나만. 욕심이 미완성을 부른다.\"", { italic: true }),
    richText(" 실제로 2순위 기능 중 수면 점수 하나만 추가한 뒤 다음으로 넘어갔고, 덕분에 MVP를 확실히 완성할 수 있었습니다."),
  ]));

  // --- 왜 30초 기록 ---
  blocks.push(heading2("왜 \"하루 30초 기록\"으로 정했나"));

  blocks.push(paragraph([
    richText("타깃 사용자를 분석하면서 가장 중요하게 생각한 특징이 있었습니다: "),
    richText("\"입력이 조금만 귀찮아도 안 쓴다.\"", { bold: true }),
  ]));

  blocks.push(paragraph("그래서 입력 항목을 딱 5개로 줄였습니다."));

  blocks.push(bulletItem("잔 시각 / 일어난 시각 — 시간 선택기 (터치 2번)"));
  blocks.push(bulletItem("자기 전 폰 사용 — 슬라이더 (손가락 한 번)"));
  blocks.push(bulletItem("오늘 컨디션 — 이모지 버튼 (터치 1번)"));
  blocks.push(bulletItem("낮에 졸렸나요 — 토글 스위치 (터치 1번)"));

  blocks.push(paragraph([
    richText("수면 시간은 직접 입력하지 않고 "),
    richText("잔 시각과 일어난 시각에서 자동 계산", { bold: true }),
    richText("되게 만들었습니다 (자정 넘김도 처리). 이렇게 해서 실제로 30초 안에 기록이 끝납니다."),
  ]));

  // --- 분석 규칙 설계 ---
  blocks.push(heading2("분석 규칙 4개는 어떻게 정했나 (직접 설계)"));

  blocks.push(
    callout("이건 AI가 아니라 제가 직접 정한 부분입니다. AI한테 \"알아서 분석해\"라고 던진 게 아닙니다.", "⭐")
  );

  blocks.push(paragraph("PRD를 쓸 때 \"단순 평균은 의미 없다\"고 판단했습니다. \"평균 6시간 잤어요\"보다 \"권장보다 2시간 부족해요\", \"폰 오래 본 날 컨디션이 낮았어요\" 같은 패턴이 행동을 바꾸는 데 효과적이라고 생각했습니다. 그래서 또래 친구들이 실제로 겪는 문제 상황 4가지를 기준으로 규칙을 설계했습니다."));

  blocks.push(bulletItem([
    richText("규칙 1 · 수면 부족: ", { bold: true }),
    richText("주중 평균 수면이 권장 8시간 미만이면 → \"권장보다 평균 N시간 부족해요\""),
  ]));
  blocks.push(bulletItem([
    richText("규칙 2 · 폰 사용과 컨디션: ", { bold: true }),
    richText("폰 사용 시간 중앙값을 기준으로, 폰을 많이 쓴 날과 적게 쓴 날의 컨디션 차이가 1점 이상이면 → \"폰을 오래 본 날 컨디션이 평균 N점 낮았어요\""),
  ]));
  blocks.push(bulletItem([
    richText("규칙 3 · 취침 불규칙: ", { bold: true }),
    richText("취침 시각의 표준편차가 60분 이상이면 → \"자는 시간이 매일 들쭉날쭉해요\""),
  ]));
  blocks.push(bulletItem([
    richText("규칙 4 · 낮 졸림: ", { bold: true }),
    richText("일주일 중 '낮에 졸렸다'가 50% 이상이면 → \"이번 주 절반 이상 낮에 졸렸어요\""),
  ]));

  blocks.push(paragraph([
    richText("특히 규칙 4는 처음 기획에 없었습니다. 개발 중에 "),
    richText("daySleepy 데이터를 수집만 하고 분석에 활용하지 않고 있다", { bold: true }),
    richText("는 것을 발견하고, 직접 규칙을 추가 설계했습니다. PRD를 수동적으로 따르기만 한 게 아니라 능동적으로 보완한 경험입니다."),
  ]));

  blocks.push(paragraph("이 규칙들을 AI(Gemini)에게 전달하면, AI는 패턴을 친구 말투로 풀어 설명해주는 역할만 합니다. 분석의 기준은 제가 세웠고, AI는 전달 방식을 담당한 겁니다."));

  // --- 계획 변경 ---
  blocks.push(heading2("만들다가 계획이 바뀐 것"));

  blocks.push(bulletItem([
    richText("데이터 저장 방식: ", { bold: true }),
    richText("처음엔 브라우저 로컬 스토리지에만 저장하려 했습니다. PRD에도 \"서버 없음, 전부 브라우저 로컬\"이라고 적었습니다. 하지만 기기가 바뀌면 기록이 날아가고, 로그인도 불가능하다는 한계를 느껴서 Supabase DB로 전환했습니다."),
  ]));
  blocks.push(bulletItem([
    richText("API 키 관리: ", { bold: true }),
    richText("처음엔 사용자가 설정 모달에서 직접 Gemini API 키를 입력하는 방식이었습니다. 하지만 실제 서비스라면 사용자에게 키를 요구할 수 없다고 판단해, Cloudflare Workers 서버리스 프록시를 도입해 키를 백엔드에 숨기는 구조로 바꿨습니다."),
  ]));
  blocks.push(bulletItem([
    richText("2순위 기능 선택: ", { bold: true }),
    richText("MVP 완성 후 2순위 기능 4개 중 \"수면 점수\"만 먼저 구현했습니다. 한 번에 하나만 집중하자는 원칙을 지켰고, 나머지는 지금도 로드맵에 남아 있습니다."),
  ]));

  blocks.push(divider());

  // === 3. 어떻게 만들었나 ===
  blocks.push(heading1("③ 어떻게 만들었나"));
  blocks.push(
    bulletItem([
      richText("프론트엔드 (HTML/CSS/JS)", { bold: true }),
      richText(
        ": Vanilla JS만으로 모듈화(State, Storage, Analysis, UI, API)를 적용해 유지보수성을 높였고, 다크 모드 톤의 모던한 그라데이션 UI와 마이크로 인터랙션(Fade & Slide)을 구현했다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("백엔드 프록시 (Cloudflare Workers)", { bold: true }),
      richText(
        ": 초기엔 프론트엔드에 Gemini API 키를 직접 노출했으나, 서버리스 프록시 환경을 구축하여 API 키를 은닉하고 CORS로 배포 도메인만 허용해 보안 아키텍처를 고도화했다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("데이터베이스 및 인증 (Supabase)", { bold: true }),
      richText(
        ": 로그인 기능을 위해 구글 OAuth를 연동했고, 사용자 기록을 로컬 스토리지에서 클라우드 DB(records 테이블)로 이전해 다중 기기 환경에서 동기화되게 했다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("데이터 보안 (RLS)", { bold: true }),
      richText(
        ": 사용자 데이터가 절대 섞이지 않도록 Supabase의 Row Level Security(RLS) 정책 4가지(select/insert/update/delete)를 auth.uid() = user_id 조건으로 설계하여 DB 차원의 격리를 완수했다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("클라우드 조합 설계", { bold: true }),
      richText(
        ": 서버를 띄우지 않고도 GitHub Pages(정적 호스팅) + Supabase(인증·DB) + Cloudflare Workers(서버리스 API) + Gemini API(AI 코멘트)를 엮어 상용 앱 수준의 구조를 만들었다."
      ),
    ])
  );
  blocks.push(divider());

  // === 4. 막혔던 순간들 ===
  blocks.push(
    heading1("④ 막혔던 순간들")
  );
  blocks.push(
    callout(
      "이 표가 포트폴리오에서 제일 강력한 부분입니다.",
      "⭐"
    )
  );
  blocks.push(
    tableBlock([
      ["문제", "원인 추적", "해결", "배운 것"],
      [
        "배포 후 OAuth 콜백 404",
        "GitHub Pages 설정·라우팅·경로를 하나씩 배제법으로 좁혀감",
        "redirectTo 경로를 배포 URL에 맞게 수정",
        "증상→배제→원인 디버깅 방법론",
      ],
      [
        "API 키 유출 위험",
        "프론트엔드 코드에 키를 넣으면 공개 저장소에서 그대로 노출",
        "Cloudflare Workers 서버리스 프록시로 키를 백엔드에 은닉 + CORS 제한",
        "실서비스의 키 관리·보안 아키텍처",
      ],
      [
        "사용자 데이터 격리",
        "로그인 사용자별 기록이 섞이면 안 됨",
        "Supabase RLS 정책 4개 설계 (auth.uid() = user_id) — 코드가 실수해도 남의 데이터 안 샘",
        "DB 차원의 개인정보 보호(RLS)",
      ],
      [
        "AI 도구 에러 종료",
        "Antigravity가 중간에 중단되어 배포 불가",
        "직접 git 명령어로 커밋·푸시하여 배포 완료",
        "도구에 의존하지 않고 직접 해결하는 힘",
      ],
      [
        "수집만 되고 활용 안 되는 데이터",
        "daySleepy 필드를 기록만 하고 분석에 반영하지 않은 것을 발견",
        "분석 규칙 4(낮 졸림 빈도)를 직접 설계·추가",
        "PRD를 수동적으로 따르지 않고 능동적으로 기획 보완",
      ],
      [
        "Supabase SQL 실행 불가",
        "Antigravity가 DB에 직접 SQL 실행 못 함",
        "에이전트가 만든 SQL을 대시보드 SQL Editor에 붙여넣어 직접 Run + 결과 검수",
        "도구의 한계를 파악하고 우회하는 능력",
      ],
    ])
  );
  blocks.push(divider());

  // === 5. 배운 것 ===
  blocks.push(heading1("⑤ 배운 것"));

  blocks.push(heading2("🔧 기술"));
  blocks.push(
    bulletItem([
      richText("클라우드 조합 설계", { bold: true }),
      richText(
        ": GitHub Pages + Supabase + Cloudflare Workers + Gemini API를 조합해 서버 없이도 인증·DB·AI를 갖춘 실서비스 아키텍처를 구축했다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("DB 설계 & 보안", { bold: true }),
      richText(
        ": 테이블 설계, RLS 정책, upsert 패턴 등 데이터베이스의 기본 개념을 실제 서비스에 적용하며 익혔다."
      ),
    ])
  );
  blocks.push(
    bulletItem([
      richText("분석 알고리즘", { bold: true }),
      richText(
        ": 평균·표준편차·중앙값 기반 분류 등 수학적 논리를 코드로 구현하고, 엣지 케이스까지 고려하는 경험을 했다."
      ),
    ])
  );

  blocks.push(heading2("💪 태도"));
  blocks.push(
    bulletItem(
      '문제를 남이 정의해 주길 기다리지 않고, "청소년 수면 부족"이라는 사회 문제를 직접 조사하고 솔루션을 기획했다.'
    )
  );
  blocks.push(
    bulletItem(
      '막힐 때마다 "안 된다"에서 멈추지 않고, 원인을 좁혀가며 끝까지 해결했다 (배포 404 디버깅, SQL 직접 실행 등).'
    )
  );

  blocks.push(heading2("🤖 AI 활용"));
  blocks.push(
    bulletItem([
      richText(
        'AI(Antigravity)를 "대신 만들어주는 도구"가 아니라 '
      ),
      richText('"같이 만드는 도구"', { bold: true }),
      richText("로 활용했다."),
    ])
  );
  blocks.push(
    bulletItem([
      richText(
        "기획·설계·분석 알고리즘은 직접 하고, 구현은 AI를 활용하되, "
      ),
      richText(
        "AI가 만든 코드를 반드시 이해하고 검수한 뒤 수용",
        { bold: true }
      ),
      richText("했다."),
    ])
  );
  blocks.push(
    bulletItem(
      "예: RLS가 왜 select에 조건 없이도 작동하는지, upsert가 unique 제약과 어떻게 짝을 이루는지 직접 분석 후 Accept"
    )
  );
  blocks.push(divider());

  // === 6. 앞으로 하고 싶은 것 ===
  blocks.push(heading1("⑥ 앞으로 하고 싶은 것"));
  blocks.push(
    todoItem([
      richText("대시보드", { bold: true }),
      richText(
        " — 주간 추이 그래프, 폰 사용↔컨디션 상관관계 시각화, 미션 완료율 표시"
      ),
    ])
  );
  blocks.push(
    todoItem([
      richText("분석 규칙 고도화", { bold: true }),
      richText(
        " — 취침 규칙성 개선 알림, 주간 AI 리포트 등"
      ),
    ])
  );
  blocks.push(
    todoItem([
      richText("앱스토어 출시 검토", { bold: true }),
      richText(" — PWA 전환 또는 React Native 래핑"),
    ])
  );
  blocks.push(divider());

  blocks.push(
    paragraph([
      richText(
        "연계 자료(PDF): 면접 스토리라인 워크시트 / SQL 구문 정리 / 각 작업기록",
        { italic: true }
      ),
    ])
  );
  blocks.push(
    paragraph([
      richText(
        "출처: 여성가족부 2025 청소년 미디어 이용습관 진단조사 / 과기정통부 2025 스마트폰 과의존 실태조사 등",
        { italic: true }
      ),
    ])
  );

  return blocks;
}

// --- 메인 실행 ---
async function main() {
  console.log("🌙 잠코치 포트폴리오(개편안) → 노션 업로드 시작...\n");

  const SLEEPCOACH_PAGE_ID = "3aa7d4ba-64e0-8026-82da-e18b73ae537f";
  const PAGE_URL = "https://app.notion.com/p/SleepCoach-3aa7d4ba64e0802682dae18b73ae537f";

  const blocks = buildPortfolioBlocks();
  console.log(`📝 총 ${blocks.length}개 블록 생성 완료`);

  // 1. 기존 블록 삭제
  console.log("🗑️ 기존 페이지 내용 삭제 중...");
  const deleted = await deleteAllBlocks(SLEEPCOACH_PAGE_ID);
  console.log(`  → ${deleted}개 블록 삭제`);

  // 2. 페이지 제목·아이콘 업데이트
  console.log("📝 페이지 제목 업데이트 중...");
  await notionFetch(`/pages/${SLEEPCOACH_PAGE_ID}`, "PATCH", {
    icon: { type: "emoji", emoji: "🌙" },
    properties: {
      title: {
        title: [richText("잠코치 (SleepCoach) — 개발 포트폴리오")],
      },
    },
  });

  // 3. 새 블록 추가 (100개씩 나눠서)
  console.log("📄 포트폴리오 내용 업로드 중...");
  await appendBlocks(SLEEPCOACH_PAGE_ID, blocks);
  console.log("✅ 업로드 완료!");

  console.log(`\n🎉 포트폴리오(개편안) 노션 업로드 완료!`);
  console.log(`🔗 노션 페이지: ${PAGE_URL}`);
}

main().catch((err) => {
  console.error("❌ 에러 발생:", err.message);
  process.exit(1);
});
