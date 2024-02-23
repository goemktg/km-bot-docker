zkillboard redisQ API 사용: https://github.com/zKillboard/RedisQ

Job Flow
1. 10초마다 2. 실행
2. 이미 3. 단계가 진행 중인경우 스킵, 아니라면 3.으로 감
3. 데이터 받아옴. null값 반환될 경우 (받아올 킬메일 없음) 스킵. 아니면 4.로 감
4. 해당 킬메일 처리 후 3로 돌아감