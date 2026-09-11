import urllib.request
import urllib.parse
import json

NOTION_API_KEY = "YOUR_NOTION_API_KEY"
HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}

def get_blocks(block_id):
    url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
    results = []
    while True:
        req = urllib.request.Request(url, headers=HEADERS, method="GET")
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                results.extend(data.get("results", []))
                if data.get("has_more"):
                    url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100&start_cursor={data.get('next_cursor')}"
                else:
                    break
        except Exception as e:
            print(f"Error: {e}")
            break
    return results

def extract_text(blocks, depth=0):
    text_content = ""
    indent = "  " * depth
    for block in blocks:
        block_type = block.get("type")
        content = ""
        
        if block_type in ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote"]:
            rich_texts = block.get(block_type, {}).get("rich_text", [])
            for rt in rich_texts:
                content += rt.get("plain_text", "")
            
            if block_type == "to_do":
                checked = "[x]" if block.get(block_type, {}).get("checked") else "[ ]"
                content = f"{checked} {content}"
            elif block_type.startswith("heading"):
                content = f"\n\n{'#' * int(block_type[-1])} {content}\n"
            elif block_type in ["bulleted_list_item"]:
                content = f"- {content}"
            elif block_type in ["numbered_list_item"]:
                content = f"1. {content}"
                
            if content.strip():
                text_content += f"{indent}{content}\n"
        
        elif block_type == "child_page":
            title = block.get(block_type, {}).get("title", "")
            text_content += f"\n{indent}--- Child Page: {title} ---\n"
            child_blocks = get_blocks(block.get("id"))
            text_content += extract_text(child_blocks, depth + 1)
        
        if block.get("has_children") and block_type != "child_page":
            child_blocks = get_blocks(block.get("id"))
            text_content += extract_text(child_blocks, depth + 1)
            
    return text_content

if __name__ == "__main__":
    page_id = "3aa7d4ba-64e0-8026-82da-e18b73ae537f"
    print("Fetching Notion content...")
    blocks = get_blocks(page_id)
    text = extract_text(blocks)
    with open("notion_content.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print("Done. Saved to notion_content.txt")
