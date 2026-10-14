
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity": {
                  Row: {
                    "actor_count": number,"actor_id": string | null,"clip_id": string | null,"created_at": string,"id": number,"kind": string,"photo_id": string | null,"requester_id": string | null,"subject": string | null,"trip_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_count"?: number,"actor_id"?: string | null,"clip_id"?: string | null,"created_at"?: string,"id"?: number,"kind": string,"photo_id"?: string | null,"requester_id"?: string | null,"subject"?: never,"trip_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actor_count"?: number,"actor_id"?: string | null,"clip_id"?: string | null,"created_at"?: string,"id"?: number,"kind"?: string,"photo_id"?: string | null,"requester_id"?: string | null,"subject"?: never,"trip_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_photo_id_fkey"
      columns: ["photo_id"]
isOneToOne: false
      referencedRelation: "team_photos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_seen": {
                  Row: {
                    "seen_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "seen_at"?: string,"user_id": string
                  }
                  Update: {
                    "seen_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"api_teams": {
                  Row: {
                    "api_id": number,"logo": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "api_id": number,"logo"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "api_id"?: number,"logo"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"created_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"chant_fires": {
                  Row: {
                    "chant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chant_id": string,"user_id"?: string
                  }
                  Update: {
                    "chant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chant_fires_chant_id_fkey"
      columns: ["chant_id"]
isOneToOne: false
      referencedRelation: "chants"
      referencedColumns: ["id"]
    }
                  ]
                },"chants": {
                  Row: {
                    "audio_path": string | null,"created_at": string,"created_by": string,"fire_count": number,"id": string,"lyrics": string,"team_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_path"?: string | null,"created_at"?: string,"created_by"?: string,"fire_count"?: number,"id"?: string,"lyrics"?: string,"team_id"?: string,"title": string
                  }
                  Update: {
                    "audio_path"?: string | null,"created_at"?: string,"created_by"?: string,"fire_count"?: number,"id"?: string,"lyrics"?: string,"team_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chants_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"checkins": {
                  Row: {
                    "away": boolean,"created_at": string,"fixture_id": number,"stadium_id": string | null,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "away"?: boolean,"created_at"?: string,"fixture_id": number,"stadium_id"?: string | null,"team_id": string,"user_id"?: string
                  }
                  Update: {
                    "away"?: boolean,"created_at"?: string,"fixture_id"?: number,"stadium_id"?: string | null,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkins_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkins_stadium_id_fkey"
      columns: ["stadium_id"]
isOneToOne: false
      referencedRelation: "stadiums"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkins_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_comments": {
                  Row: {
                    "body": string,"clip_id": string,"created_at": string,"id": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"clip_id": string,"created_at"?: string,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"clip_id"?: string,"created_at"?: string,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_comments_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clip_comments_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_like_days": {
                  Row: {
                    "day": string,"likes": number,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"likes"?: number,"team_id": string,"user_id": string
                  }
                  Update: {
                    "day"?: string,"likes"?: number,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_like_days_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_likes": {
                  Row: {
                    "clip_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clip_id": string,"user_id"?: string
                  }
                  Update: {
                    "clip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_likes_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_respects": {
                  Row: {
                    "clip_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clip_id": string,"user_id"?: string
                  }
                  Update: {
                    "clip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_respects_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_views": {
                  Row: {
                    "clip_id": string,"user_id": string,"viewed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clip_id": string,"user_id"?: string,"viewed_at"?: string
                  }
                  Update: {
                    "clip_id"?: string,"user_id"?: string,"viewed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_views_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    }
                  ]
                },"clips": {
                  Row: {
                    "audience": string,"caption": string,"comments_count": number,"created_at": string,"expires_at": string,"id": string,"kind": string,"likes_count": number,"media_path": string,"nick": string,"once": boolean,"respects_count": number,"tags": string,"team_id": string,"user_id": string,"views_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: string,"caption"?: string,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind": string,"likes_count"?: number,"media_path": string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"tags"?: string,"team_id"?: string,"user_id"?: string,"views_count"?: number
                  }
                  Update: {
                    "audience"?: string,"caption"?: string,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: string,"likes_count"?: number,"media_path"?: string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"tags"?: string,"team_id"?: string,"user_id"?: string,"views_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "clips_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"club_reps": {
                  Row: {
                    "created_at": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "club_reps_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"device_keys": {
                  Row: {
                    "created_at": string,"device_id": string,"public_jwk": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"device_id": string,"public_jwk": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"device_id"?: string,"public_jwk"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dm_group_events": {
                  Row: {
                    "actor": string | null,"created_at": string,"group_id": string,"id": string,"kind": string,"subject": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"kind": string,"subject"?: string | null
                  }
                  Update: {
                    "actor"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"kind"?: string,"subject"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_group_events_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "dm_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_group_members": {
                  Row: {
                    "group_id": string,"invited_at": string,"invited_by": string | null,"joined_at": string | null,"muted": boolean,"role": string,"unread": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"invited_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"muted"?: boolean,"role": string,"unread"?: number,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"invited_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"muted"?: boolean,"role"?: string,"unread"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "dm_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_group_messages": {
                  Row: {
                    "ciphertext": string,"created_at": string,"group_id": string,"id": string,"iv": string,"sender_device": string,"sender_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"created_at"?: string,"group_id": string,"id"?: string,"iv": string,"sender_device": string,"sender_id"?: string,"wrapped_keys": NonNullable<Json>
                  }
                  Update: {
                    "ciphertext"?: string,"created_at"?: string,"group_id"?: string,"id"?: string,"iv"?: string,"sender_device"?: string,"sender_id"?: string,"wrapped_keys"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_group_messages_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "dm_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_groups": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"last_at": string,"last_from": string | null,"last_message_id": string | null,"members_count": number,"name": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"members_count"?: number,"name": string,"team_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"members_count"?: number,"name"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_groups_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_messages": {
                  Row: {
                    "ciphertext": string,"created_at": string,"id": string,"iv": string,"sender_device": string,"sender_id": string,"thread_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"created_at"?: string,"id"?: string,"iv": string,"sender_device": string,"sender_id"?: string,"thread_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  Update: {
                    "ciphertext"?: string,"created_at"?: string,"id"?: string,"iv"?: string,"sender_device"?: string,"sender_id"?: string,"thread_id"?: string,"wrapped_keys"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "dm_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_threads": {
                  Row: {
                    "created_at": string,"id": string,"last_at": string,"last_from": string | null,"last_message_id": string | null,"nick_a": string,"nick_b": string,"unread_a": number,"unread_b": number,"user_a": string,"user_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"nick_a"?: string,"nick_b"?: string,"unread_a"?: number,"unread_b"?: number,"user_a": string,"user_b": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"nick_a"?: string,"nick_b"?: string,"unread_a"?: number,"unread_b"?: number,"user_a"?: string,"user_b"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fan_event_going": {
                  Row: {
                    "event_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"user_id"?: string
                  }
                  Update: {
                    "event_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_event_going_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "fan_events"
      referencedColumns: ["id"]
    }
                  ]
                },"fan_events": {
                  Row: {
                    "area": string,"created_at": string,"going_count": number,"id": string,"kind": string,"nick": string,"note": string,"starts_at": string,"team_id": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"created_at"?: string,"going_count"?: number,"id"?: string,"kind": string,"nick"?: string,"note"?: string,"starts_at": string,"team_id"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "area"?: string,"created_at"?: string,"going_count"?: number,"id"?: string,"kind"?: string,"nick"?: string,"note"?: string,"starts_at"?: string,"team_id"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_events_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"fan_lineup_tallies": {
                  Row: {
                    "fixture_id": number,"formation": string,"picks": number,"player_id": string,"slot": number,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fixture_id": number,"formation": string,"picks": number,"player_id": string,"slot": number,"team_id": string
                  }
                  Update: {
                    "fixture_id"?: number,"formation"?: string,"picks"?: number,"player_id"?: string,"slot"?: number,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_lineup_tallies_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fan_lineup_tallies_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"fan_lineup_totals": {
                  Row: {
                    "fans": number,"fixture_id": number,"formations": NonNullable<Json>,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fans"?: number,"fixture_id": number,"formations"?: NonNullable<Json>,"team_id": string
                  }
                  Update: {
                    "fans"?: number,"fixture_id"?: number,"formations"?: NonNullable<Json>,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_lineup_totals_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fan_lineup_totals_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"fan_lineups": {
                  Row: {
                    "fixture_id": number,"formation": string,"slots": NonNullable<Json>,"team_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fixture_id": number,"formation": string,"slots": NonNullable<Json>,"team_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "fixture_id"?: number,"formation"?: string,"slots"?: NonNullable<Json>,"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_lineups_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fan_lineups_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"fixture_details": {
                  Row: {
                    "events": NonNullable<Json>,"fixture_id": number,"lineups": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "events"?: NonNullable<Json>,"fixture_id": number,"lineups"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "events"?: NonNullable<Json>,"fixture_id"?: number,"lineups"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixture_details_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: true
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
                  ]
                },"fixtures": {
                  Row: {
                    "away_api_id": number,"away_goals": number | null,"elapsed": number | null,"home_api_id": number,"home_goals": number | null,"id": number,"is_demo": boolean,"kickoff_at": string,"league_id": number,"round": string,"season": number,"status": string,"updated_at": string,"venue": string
                  }
                  ComputedFields: never
                  Insert: {
                    "away_api_id": number,"away_goals"?: number | null,"elapsed"?: number | null,"home_api_id": number,"home_goals"?: number | null,"id": number,"is_demo"?: boolean,"kickoff_at": string,"league_id": number,"round": string,"season": number,"status": string,"updated_at"?: string,"venue"?: string
                  }
                  Update: {
                    "away_api_id"?: number,"away_goals"?: number | null,"elapsed"?: number | null,"home_api_id"?: number,"home_goals"?: number | null,"id"?: number,"is_demo"?: boolean,"kickoff_at"?: string,"league_id"?: number,"round"?: string,"season"?: number,"status"?: string,"updated_at"?: string,"venue"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixtures_away_api_id_fkey"
      columns: ["away_api_id"]
isOneToOne: false
      referencedRelation: "api_teams"
      referencedColumns: ["api_id"]
    },{
      foreignKeyName: "fixtures_home_api_id_fkey"
      columns: ["home_api_id"]
isOneToOne: false
      referencedRelation: "api_teams"
      referencedColumns: ["api_id"]
    }
                  ]
                },"market_items": {
                  Row: {
                    "category": string,"condition": string,"created_at": string,"id": string,"media_path": string | null,"nick": string,"price": number,"size": string,"sold": boolean,"team_id": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"condition": string,"created_at"?: string,"id"?: string,"media_path"?: string | null,"nick"?: string,"price": number,"size"?: string,"sold"?: boolean,"team_id"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "category"?: string,"condition"?: string,"created_at"?: string,"id"?: string,"media_path"?: string | null,"nick"?: string,"price"?: number,"size"?: string,"sold"?: boolean,"team_id"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_items_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"match_alerts": {
                  Row: {
                    "away_goals": number,"created_at": string,"fixture_id": number,"home_goals": number,"id": number,"kind": string,"scoring_api_id": number | null,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_goals": number,"created_at"?: string,"fixture_id": number,"home_goals": number,"id"?: number,"kind": string,"scoring_api_id"?: number | null,"sent_at"?: string | null
                  }
                  Update: {
                    "away_goals"?: number,"created_at"?: string,"fixture_id"?: number,"home_goals"?: number,"id"?: number,"kind"?: string,"scoring_api_id"?: number | null,"sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_alerts_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
                  ]
                },"match_chat_bursts": {
                  Row: {
                    "at": string,"fixture_id": number,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"fixture_id": number,"kind": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"fixture_id"?: number,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_chat_bursts_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
                  ]
                },"match_messages": {
                  Row: {
                    "body": string,"created_at": string,"fixture_id": number,"id": string,"nick": string,"side": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"fixture_id": number,"id"?: string,"nick"?: string,"side"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"fixture_id"?: number,"id"?: string,"nick"?: string,"side"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_messages_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_messages_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"match_poll_queue": {
                  Row: {
                    "fixture_id": number,"id": number,"kind": string,"payload": NonNullable<Json>,"queued_at": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fixture_id": number,"id"?: number,"kind": string,"payload": NonNullable<Json>,"queued_at"?: string,"source": string
                  }
                  Update: {
                    "fixture_id"?: number,"id"?: number,"kind"?: string,"payload"?: NonNullable<Json>,"queued_at"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_poll_queue_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
                  ]
                },"match_poll_tallies": {
                  Row: {
                    "n": number,"option_id": string,"poll_id": string,"row_kind": string,"voter_group": string
                  }
                  ComputedFields: never
                  Insert: {
                    "n"?: number,"option_id": string,"poll_id": string,"row_kind": string,"voter_group": string
                  }
                  Update: {
                    "n"?: number,"option_id"?: string,"poll_id"?: string,"row_kind"?: string,"voter_group"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_poll_tallies_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "match_polls"
      referencedColumns: ["id"]
    }
                  ]
                },"match_poll_votes": {
                  Row: {
                    "option_id": string,"option_in": string | null,"poll_id": string,"updated_at": string,"user_id": string,"voter_group": string
                  }
                  ComputedFields: never
                  Insert: {
                    "option_id": string,"option_in"?: string | null,"poll_id": string,"updated_at"?: string,"user_id"?: string,"voter_group"?: string
                  }
                  Update: {
                    "option_id"?: string,"option_in"?: string | null,"poll_id"?: string,"updated_at"?: string,"user_id"?: string,"voter_group"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_poll_votes_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "match_polls"
      referencedColumns: ["id"]
    }
                  ]
                },"match_polls": {
                  Row: {
                    "closes_at": string,"created_at": string,"fixture_id": number,"id": string,"kind": string,"last_tally_at": string,"opens_at": string,"options": NonNullable<Json>,"options_in": Json | null,"question": string,"source": string,"summary": string | null,"voter_scope": string | null,"crowd_poll_json": Json | null
                  }
                  ComputedFields: "crowd_poll_json"
                  Insert: {
                    "closes_at": string,"created_at"?: string,"fixture_id": number,"id"?: string,"kind": string,"last_tally_at"?: string,"opens_at"?: string,"options": NonNullable<Json>,"options_in"?: Json | null,"question": string,"source": string,"summary"?: string | null,"voter_scope"?: string | null
                  }
                  Update: {
                    "closes_at"?: string,"created_at"?: string,"fixture_id"?: number,"id"?: string,"kind"?: string,"last_tally_at"?: string,"opens_at"?: string,"options"?: NonNullable<Json>,"options_in"?: Json | null,"question"?: string,"source"?: string,"summary"?: string | null,"voter_scope"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_polls_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_polls_voter_scope_fkey"
      columns: ["voter_scope"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"match_rating_stats": {
                  Row: {
                    "count": number,"fixture_id": number,"player_id": string,"sum": number
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"fixture_id": number,"player_id": string,"sum"?: number
                  }
                  Update: {
                    "count"?: number,"fixture_id"?: number,"player_id"?: string,"sum"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_rating_stats_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_rating_stats_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"match_ratings": {
                  Row: {
                    "fixture_id": number,"player_id": string,"score": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fixture_id": number,"player_id": string,"score": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "fixture_id"?: number,"player_id"?: string,"score"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_ratings_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_ratings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "matches": string,"messages": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "matches"?: string,"messages"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "matches"?: string,"messages"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"player_rating_likes": {
                  Row: {
                    "author_id": string,"created_at": string,"player_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"created_at"?: string,"player_id": string,"user_id"?: string
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"player_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_rating_likes_player_id_author_id_fkey"
      columns: ["player_id","author_id"]
isOneToOne: false
      referencedRelation: "player_ratings"
      referencedColumns: ["player_id","user_id"]
    }
                  ]
                },"player_rating_stats": {
                  Row: {
                    "count": number,"d1": number,"d2": number,"d3": number,"d4": number,"d5": number,"player_id": string,"sum": number
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"d1"?: number,"d2"?: number,"d3"?: number,"d4"?: number,"d5"?: number,"player_id": string,"sum"?: number
                  }
                  Update: {
                    "count"?: number,"d1"?: number,"d2"?: number,"d3"?: number,"d4"?: number,"d5"?: number,"player_id"?: string,"sum"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_rating_stats_player_id_fkey"
      columns: ["player_id"]
isOneToOne: true
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"player_ratings": {
                  Row: {
                    "likes_count": number,"nick": string,"player_id": string,"review": string,"stars": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "likes_count"?: number,"nick"?: string,"player_id": string,"review"?: string,"stars": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "likes_count"?: number,"nick"?: string,"player_id"?: string,"review"?: string,"stars"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_ratings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "id": string,"in_xi": boolean,"injured": boolean,"name_he": string,"name_short": string,"number": number | null,"pitch_x": number | null,"pitch_y": number | null,"position": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"in_xi"?: boolean,"injured"?: boolean,"name_he": string,"name_short": string,"number"?: number | null,"pitch_x"?: number | null,"pitch_y"?: number | null,"position": string,"team_id": string
                  }
                  Update: {
                    "id"?: string,"in_xi"?: boolean,"injured"?: boolean,"name_he"?: string,"name_short"?: string,"number"?: number | null,"pitch_x"?: number | null,"pitch_y"?: number | null,"position"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"prediction_totals": {
                  Row: {
                    "exact": number,"played": number,"points": number,"season": number,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exact"?: number,"played"?: number,"points"?: number,"season": number,"team_id": string,"user_id": string
                  }
                  Update: {
                    "exact"?: number,"played"?: number,"points"?: number,"season"?: number,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prediction_totals_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"predictions": {
                  Row: {
                    "away_goals": number,"created_at": string,"exact": boolean | null,"fixture_id": number,"home_goals": number,"points": number | null,"team_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "away_goals": number,"created_at"?: string,"exact"?: boolean | null,"fixture_id": number,"home_goals": number,"points"?: number | null,"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "away_goals"?: number,"created_at"?: string,"exact"?: boolean | null,"fixture_id"?: number,"home_goals"?: number,"points"?: number | null,"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "predictions_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "predictions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"nick": string,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"note": string,"reason": string,"ref": string,"reporter_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"note"?: string,"reason": string,"ref": string,"reporter_id"?: string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"note"?: string,"reason"?: string,"ref"?: string,"reporter_id"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stadiums": {
                  Row: {
                    "id": string,"lat": number,"lng": number,"name_he": string,"names": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"lat": number,"lng": number,"name_he": string,"names": (string)[]
                  }
                  Update: {
                    "id"?: string,"lat"?: number,"lng"?: number,"name_he"?: string,"names"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"standings": {
                  Row: {
                    "api_team_id": number,"description": string,"drawn": number,"form": string,"ga": number,"gd": number,"gf": number,"group_name": string,"group_order": number,"lost": number,"played": number,"points": number,"rank": number,"season": number,"updated_at": string,"won": number
                  }
                  ComputedFields: never
                  Insert: {
                    "api_team_id": number,"description"?: string,"drawn": number,"form"?: string,"ga": number,"gd": number,"gf": number,"group_name": string,"group_order": number,"lost": number,"played": number,"points": number,"rank": number,"season": number,"updated_at"?: string,"won": number
                  }
                  Update: {
                    "api_team_id"?: number,"description"?: string,"drawn"?: number,"form"?: string,"ga"?: number,"gd"?: number,"gf"?: number,"group_name"?: string,"group_order"?: number,"lost"?: number,"played"?: number,"points"?: number,"rank"?: number,"season"?: number,"updated_at"?: string,"won"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "standings_api_team_id_fkey"
      columns: ["api_team_id"]
isOneToOne: false
      referencedRelation: "api_teams"
      referencedColumns: ["api_id"]
    }
                  ]
                },"team_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_messages_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"team_photo_comments": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"nick": string,"photo_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"nick"?: string,"photo_id": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"nick"?: string,"photo_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_photo_comments_photo_id_fkey"
      columns: ["photo_id"]
isOneToOne: false
      referencedRelation: "team_photos"
      referencedColumns: ["id"]
    }
                  ]
                },"team_photo_likes": {
                  Row: {
                    "photo_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "photo_id": string,"user_id"?: string
                  }
                  Update: {
                    "photo_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_photo_likes_photo_id_fkey"
      columns: ["photo_id"]
isOneToOne: false
      referencedRelation: "team_photos"
      referencedColumns: ["id"]
    }
                  ]
                },"team_photos": {
                  Row: {
                    "caption": string,"comments_count": number,"created_at": string,"id": string,"likes_count": number,"media_path": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"id"?: string,"likes_count"?: number,"media_path": string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"id"?: string,"likes_count"?: number,"media_path"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_photos_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"team_stats": {
                  Row: {
                    "fans": number,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fans"?: number,"team_id": string
                  }
                  Update: {
                    "fans"?: number,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_stats_team_id_fkey"
      columns: ["team_id"]
isOneToOne: true
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "api_names": (string)[],"color_bar": string,"color_bg": string,"color_ring": string,"id": string,"name": string,"short": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "api_names"?: (string)[],"color_bar": string,"color_bg": string,"color_ring": string,"id": string,"name": string,"short": string,"sort": number
                  }
                  Update: {
                    "api_names"?: (string)[],"color_bar"?: string,"color_bg"?: string,"color_ring"?: string,"id"?: string,"name"?: string,"short"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"trip_requests": {
                  Row: {
                    "created_at": string,"nick": string,"status": string,"team_id": string,"trip_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"nick"?: string,"status"?: string,"team_id"?: string,"trip_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"nick"?: string,"status"?: string,"team_id"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_requests_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_requests_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "cost": string,"created_at": string,"depart_before_min": number,"fixture_id": number,"from_city": string,"id": string,"kind": string,"nick": string,"note": string,"seats": number,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost"?: string,"created_at"?: string,"depart_before_min"?: number,"fixture_id": number,"from_city": string,"id"?: string,"kind": string,"nick"?: string,"note"?: string,"seats"?: number,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "cost"?: string,"created_at"?: string,"depart_before_min"?: number,"fixture_id"?: number,"from_city"?: string,"id"?: string,"kind"?: string,"nick"?: string,"note"?: string,"seats"?: number,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activity_broadcast":
{ Args: { "p_kind": string,"p_user": string }; Returns: undefined
                           },
"activity_like":
{ Args: { "p_kind": string,"p_liker": string,"p_subject": string,"p_user": string }; Returns: undefined
                           },
"activity_like_total":
{ Args: { "p_kind": string,"p_subject": string,"p_user": string }; Returns: number
                           },
"activity_prune":
{ Args: { "p_user": string }; Returns: undefined
                           },
"activity_trip_drop":
{ Args: { "p_kind": string,"p_requester": string,"p_trip": string,"p_user": string }; Returns: undefined
                           },
"activity_trip_put":
{ Args: { "p_actor": string,"p_kind": string,"p_trip": string,"p_user": string }; Returns: undefined
                           },
"activity_unlike":
{ Args: { "p_kind": string,"p_liker": string,"p_subject": string,"p_user": string }; Returns: undefined
                           },
"activity_unread_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"alert_recipients":
{ Args: { "p_after"?: string,"p_fixture": number,"p_limit"?: number }; Returns: string[]
                           },
"answer_invite":
{ Args: { "p_group": string,"p_yes": boolean }; Returns: undefined
                           },
"blocked_between":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"check_in":
{ Args: { "p_fixture": number,"p_lat": number,"p_lng": number }; Returns: Json
                           },
"claim_alerts":
{ Args: { "p_limit": number }; Returns: {
              "away_goals": number,
"created_at": string,
"fixture_id": number,
"home_goals": number,
"id": number,
"kind": string,
"scoring_api_id": number | null,
"sent_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "match_alerts"
        isOneToOne: false
        isSetofReturn: true
      } },
"clear_fan_lineup":
{ Args: { "p_fixture": number }; Returns: boolean
                           },
"clip_seen":
{ Args: { "p_clip": string }; Returns: boolean
                           },
"club_of_api":
{ Args: { "p_api_id": number }; Returns: string
                           },
"create_group":
{ Args: { "p_members": (string)[],"p_name": string }; Returns: string
                           },
"crowd_bump":
{ Args: { "p_delta": number,"p_group": string,"p_option": string,"p_poll": string,"p_row": string }; Returns: undefined
                           },
"crowd_chat_template":
{ Args: { "p_kind": string }; Returns: Record<string, unknown>
                           },
"crowd_keyword":
{ Args: { "p_body": string }; Returns: string
                           },
"crowd_open_poll":
{ Args: { "p_fixture": number,"p_kind": string,"p_options": Json,"p_options_in": Json,"p_question": string,"p_scope": string,"p_source": string }; Returns: string
                           },
"crowd_poll_json":
{ Args: { "p": Omit<Database["public"]['Tables']["match_polls"]['Row'], Database["public"]['Tables']["match_polls"]['ComputedFields']> }; Returns: Json
                           },
"crowd_tallies_json":
{ Args: { "p_poll": string }; Returns: Json
                           },
"crowd_tick":
{ Args: { "p_fixture": number }; Returns: undefined
                           },
"distance_m":
{ Args: { "lat1": number,"lat2": number,"lng1": number,"lng2": number }; Returns: number
                           },
"dm_group_lock":
{ Args: { "p_group": string }; Returns: string
                           },
"dm_group_name":
{ Args: { "p_name": string }; Returns: string
                           },
"group_push_targets":
{ Args: { "p_group": string }; Returns: string[]
                           },
"home_active_fans":
{ Args: { "p_team": string }; Returns: number
                           },
"home_fans_of_week":
{ Args: { "p_team": string }; Returns: {
              "nick": string,"points": number
            }[]
                           },
"home_player_reviews":
{ Args: { "p_per_player"?: number }; Returns: {
              "author_id": string,"liked": boolean,"likes_count": number,"nick": string,"player_id": string,"review": string,"stars": number,"updated_at": string
            }[]
                           },
"invite_to_group":
{ Args: { "p_group": string,"p_members": (string)[] }; Returns: (string)[]
                           },
"is_club_rep":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"leave_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"mark_activity_seen":
{ Args: { "p_upto": string }; Returns: undefined
                           },
"mark_read":
{ Args: { "p_id": string,"p_kind": string }; Returns: undefined
                           },
"match_room_open":
{ Args: { "p_at"?: string,"p_kickoff": string }; Returns: boolean
                           },
"message_push_allowed":
{ Args: { "p_users": (string)[] }; Returns: string[]
                           },
"mute_group":
{ Args: { "p_group": string,"p_muted": boolean }; Returns: undefined
                           },
"my_groups":
{ Args: { "with_invites": boolean }; Returns: string[]
                           },
"my_team":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"open_event_poll":
{ Args: { "p_fixture": number,"p_kind": string,"p_options": Json,"p_options_in": Json,"p_question": string,"p_scope": string }; Returns: string
                           },
"remove_from_group":
{ Args: { "p_group": string,"p_user": string }; Returns: undefined
                           },
"rename_group":
{ Args: { "p_group": string,"p_name": string }; Returns: undefined
                           },
"same_team":
{ Args: { "other": string }; Returns: boolean
                           },
"save_fan_lineup":
{ Args: { "p_fixture": number,"p_formation": string,"p_slots": Json }; Returns: {
              "fixture_id": number,
"formation": string,
"slots": NonNullable<Json>,
"team_id": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "fan_lineups"
        isOneToOne: true
        isSetofReturn: false
      } },
"score_fixture":
{ Args: { "p_fixture": number }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
