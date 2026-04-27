"""LiveKit client wrapper."""

import datetime
from livekit.api import AccessToken, VideoGrants

class LiveKitClient:
    """Wrapper around livekit-api AccessToken."""
    
    def __init__(self, api_key: str, api_secret: str, url: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.url = url

    def generate_join_token(
        self,
        *,
        identity: str,
        display_name: str,
        room_name: str,
        ttl_seconds: int = 3600,
    ) -> str:
        """Generate a JWT token for a user to join a room."""
        grant = VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        )
        
        access_token = (
            AccessToken(self.api_key, self.api_secret)
            .with_identity(identity)
            .with_name(display_name)
            .with_grants(grant)
            .with_ttl(datetime.timedelta(seconds=ttl_seconds))
        )
        
        return access_token.to_jwt()
