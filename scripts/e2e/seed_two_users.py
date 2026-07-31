"""E2E test script: register 2 users, create room, join both."""
import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000/api/v1"

async def main():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as client:
        # 1. Register user1
        print("=== Registering user1@test.com ===")
        r = await client.post("/auth/register", json={
            "email": "user1@test.com",
            "password": "TestPass123!",
            "display_name": "User One"
        })
        print(f"  Status: {r.status_code}")
        if r.status_code == 201:
            print(f"  Response: {r.json()}")
        elif r.status_code == 409:
            print("  Already exists, will login instead")
        else:
            print(f"  Error: {r.text}")

        # 2. Register user2
        print("\n=== Registering user2@test.com ===")
        r = await client.post("/auth/register", json={
            "email": "user2@test.com",
            "password": "TestPass123!",
            "display_name": "User Two"
        })
        print(f"  Status: {r.status_code}")
        if r.status_code == 201:
            print(f"  Response: {r.json()}")
        elif r.status_code == 409:
            print("  Already exists, will login instead")
        else:
            print(f"  Error: {r.text}")

        # 3. Login user1
        print("\n=== Login user1 ===")
        r = await client.post("/auth/login", json={
            "email": "user1@test.com",
            "password": "TestPass123!"
        })
        print(f"  Status: {r.status_code}")
        if r.status_code != 200:
            print(f"  Error: {r.text}")
            return
        login1 = r.json()
        token1 = login1["access_token"]
        user1_id = login1["user"]["id"]
        print(f"  User1 ID: {user1_id}")

        # 4. Login user2
        print("\n=== Login user2 ===")
        r = await client.post("/auth/login", json={
            "email": "user2@test.com",
            "password": "TestPass123!"
        })
        print(f"  Status: {r.status_code}")
        if r.status_code != 200:
            print(f"  Error: {r.text}")
            return
        login2 = r.json()
        token2 = login2["access_token"]
        user2_id = login2["user"]["id"]
        print(f"  User2 ID: {user2_id}")

        # 5. User1 creates a room
        print("\n=== User1 creates room ===")
        r = await client.post("/rooms", json={
            "name": "E2E Test Room",
            "subject": "Testing",
            "max_members": 8,
            "is_public": True
        }, headers={"Authorization": f"Bearer {token1}"})
        print(f"  Status: {r.status_code}")
        if r.status_code not in (200, 201):
            print(f"  Error: {r.text}")
            return
        room = r.json()
        room_id = room["id"]
        print(f"  Room ID: {room_id}")
        print(f"  Room: {json.dumps(room, indent=2)}")

        # 6. User2 joins the room
        print("\n=== User2 joins room ===")
        r = await client.post(f"/rooms/{room_id}/join",
            headers={"Authorization": f"Bearer {token2}"})
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text}")

        # 7. Verify room members
        print("\n=== Room members ===")
        r = await client.get(f"/rooms/{room_id}",
            headers={"Authorization": f"Bearer {token1}"})
        print(f"  Status: {r.status_code}")
        detail = r.json()
        print(f"  Members ({len(detail.get('members', []))}):")
        for m in detail.get("members", []):
            print(f"    - {m['display_name']} ({m['email']})")

        # 8. Test WebSocket connectivity
        print("\n=== WebSocket test ===")
        import websockets
        ws_url = f"ws://localhost:8000/ws/rooms/{room_id}?token={token1}"
        print(f"  Connecting to {ws_url[:80]}...")
        try:
            async with websockets.connect(ws_url) as ws:
                # Should get user_joined for ourselves
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                print(f"  Received: {msg}")

                # Connect user2
                ws_url2 = f"ws://localhost:8000/ws/rooms/{room_id}?token={token2}"
                async with websockets.connect(ws_url2) as ws2:
                    # user1 should get user_joined for user2
                    msg1 = await asyncio.wait_for(ws.recv(), timeout=5)
                    print(f"  User1 received (user2 join): {msg1}")
                    # user2 should get user_joined for themselves
                    msg2 = await asyncio.wait_for(ws2.recv(), timeout=5)
                    print(f"  User2 received (self join): {msg2}")
                    
                    print("\n  ✅ WebSocket presence working!")

        except ImportError:
            print("  websockets not installed, skipping WS test")
        except Exception as e:
            print(f"  ❌ WebSocket error: {e}")

        # 9. Test LiveKit token endpoint
        print("\n=== LiveKit token test ===")
        r = await client.post(f"/rooms/{room_id}/livekit-token",
            headers={"Authorization": f"Bearer {token1}"})
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")

        # Summary
        print("\n" + "=" * 50)
        print("SUMMARY")
        print("=" * 50)
        print(f"Room ID: {room_id}")
        print(f"User1 token: {token1[:30]}...")
        print(f"User2 token: {token2[:30]}...")
        print(f"\nOpen in browser:")
        print(f"  Tab 1: http://localhost:5173/login (user1@test.com / TestPass123!)")
        print(f"  Tab 2: http://localhost:5173/login (user2@test.com / TestPass123!)")
        print(f"  Then both navigate to: /rooms/{room_id}")

asyncio.run(main())
