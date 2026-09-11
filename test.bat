@echo off
curl -s -X POST https://sleepcoach.ora111012.workers.dev/ -H "Content-Type: application/json" -d "{\"prompt\":\"평균 수면 6.2시간, 폰 사용 95분\"}"
