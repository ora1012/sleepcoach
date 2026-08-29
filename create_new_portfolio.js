// 새 노션 포트폴리오 페이지 생성 스크립트
// 사용법: node create_new_portfolio.js

const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_VERSION = "2022-06-28";

// 부모 페이지 (장승준 - 포트폴리오)
const PARENT_PAGE_ID = "3787d4ba-64e0-81e7-90f9-d47cfc420614";

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

function callout(text, emoji = "💡") {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: [richText(text)],
      icon: { type: "emoji", emoji },
      color: "gray_background",
    },
  };
}

function divider() {
  return { object: "block", type: "divider", divider: {} };
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

function todoItem(text) {
  return {
    object: "block",
    type: "to_do",
    to_do: {
      rich_text: [richText(text)],
      checked: false,
      color: "default",
    },
  };
}

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

async function createPage(parentId, title, icon, children) {
  const body = {
    parent: { type: "page_id", page_id: parentId },
    icon: { type: "emoji", emoji: icon },
    properties: {
      title: {
        title: [richText(title)],
      },
    },
    children: children.slice(0, 100),
  };
  return await notionFetch("/pages", "POST", body);
}

function buildBlocks() {
  const blocks = [];

  // 1. 테이블
  blocks.push(
    tableBlock([
      ["항목", "내용"],
      ["프로젝트명", "잠코치 (SleepCoach)"],
      [
        "한 줄 소개",
        "청소년 수면·스마트폰 습관을 기록하고 AI가 분석해주는 웹앱",
      ],
      ["배포 링크", "https://ora1012.github.io/sleepcoach/"],
      ["개발 기간", "2026.06 ~ (진행 중)"],
      [
        "사용 기술",
        "HTML/CSS/JS · Supabase(Auth+DB) · Cloudflare Workers · Gemini API",
      ],
    ])
  );
  blocks.push(divider());

  // 2. 목차 (제목만)
  blocks.push(heading1("① 왜 만들었나"));
  blocks.push(divider());
  
  blocks.push(heading1("② 어떻게 기획했나"));
  blocks.push(divider());
  
  blocks.push(heading1("③ 어떻게 만들었나"));
  blocks.push(divider());
  
  blocks.push(heading1("④ 막혔던 순간들"));
  blocks.push(divider());
  
  blocks.push(heading1("⑤ 배운 것"));
  blocks.push(divider());
  
  blocks.push(heading1("⑥ 앞으로 하고 싶은 것"));
  blocks.push(divider());

  // 3. 스크린샷 플레이스홀더
  blocks.push(heading1("📸 스크린샷 모음 (여기에 이미지를 붙여넣으세요)"));
  blocks.push(todoItem("기록 화면 스크린샷 추가"));
  blocks.push(callout("여기에 기록 화면 스크린샷을 붙여넣으세요.", "🖼️"));
  
  blocks.push(todoItem("분석 화면 스크린샷 추가"));
  blocks.push(callout("여기에 분석 화면 스크린샷을 붙여넣으세요.", "🖼️"));
  
  blocks.push(todoItem("미션 화면 스크린샷 추가"));
  blocks.push(callout("여기에 미션 화면 스크린샷을 붙여넣으세요.", "🖼️"));
  
  blocks.push(todoItem("달력 화면 스크린샷 추가"));
  blocks.push(callout("여기에 달력 화면 스크린샷을 붙여넣으세요.", "🖼️"));
  
  blocks.push(todoItem("Supabase 데이터 표 스크린샷 추가"));
  blocks.push(callout("여기에 Supabase 데이터가 쌓인 표 스크린샷을 붙여넣으세요.", "🖼️"));

  return blocks;
}

async function main() {
  console.log("새 포트폴리오 뼈대 페이지 생성 중...");
  const blocks = buildBlocks();
  
  const page = await createPage(
    PARENT_PAGE_ID,
    "잠코치 개발 포트폴리오 (새 뼈대)",
    "📝",
    blocks
  );
  
  console.log("✅ 페이지 생성 성공!");
  console.log(`🔗 노션 페이지 URL: ${page.url}`);
}

main().catch((err) => {
  console.error("❌ 에러 발생:", err.message);
  process.exit(1);
});
