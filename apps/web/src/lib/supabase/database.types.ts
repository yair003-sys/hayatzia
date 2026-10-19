
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
                },"admin_actions": {
                  Row: {
                    "action": string,"admin_id": string | null,"created_at": string,"id": number,"kind": string | null,"note": string,"ref": string | null,"target_user": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_id"?: string | null,"created_at"?: string,"id"?: never,"kind"?: string | null,"note"?: string,"ref"?: string | null,"target_user"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_id"?: string | null,"created_at"?: string,"id"?: never,"kind"?: string | null,"note"?: string,"ref"?: string | null,"target_user"?: string | null
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
                },"app_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
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
                    "audio_path": string | null,"created_at": string,"created_by": string,"fire_count": number,"hidden_at": string | null,"id": string,"lyrics": string,"team_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_path"?: string | null,"created_at"?: string,"created_by"?: string,"fire_count"?: number,"hidden_at"?: string | null,"id"?: string,"lyrics"?: string,"team_id"?: string,"title": string
                  }
                  Update: {
                    "audio_path"?: string | null,"created_at"?: string,"created_by"?: string,"fire_count"?: number,"hidden_at"?: string | null,"id"?: string,"lyrics"?: string,"team_id"?: string,"title"?: string
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
                    "body": string,"clip_id": string,"created_at": string,"hidden_at": string | null,"id": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"clip_id": string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"clip_id"?: string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
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
                    "audience": string,"caption": string,"captions": NonNullable<Json>,"comments_count": number,"created_at": string,"expires_at": string,"filter": string,"hidden_at": string | null,"id": string,"kind": string,"likes_count": number,"media_path": string,"nick": string,"once": boolean,"respects_count": number,"speed": number,"tags": string,"team_id": string,"trim_end": number | null,"trim_start": number,"user_id": string,"views_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: string,"caption"?: string,"captions"?: NonNullable<Json>,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"filter"?: string,"hidden_at"?: string | null,"id"?: string,"kind": string,"likes_count"?: number,"media_path": string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"speed"?: number,"tags"?: string,"team_id"?: string,"trim_end"?: number | null,"trim_start"?: number,"user_id"?: string,"views_count"?: number
                  }
                  Update: {
                    "audience"?: string,"caption"?: string,"captions"?: NonNullable<Json>,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"filter"?: string,"hidden_at"?: string | null,"id"?: string,"kind"?: string,"likes_count"?: number,"media_path"?: string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"speed"?: number,"tags"?: string,"team_id"?: string,"trim_end"?: number | null,"trim_start"?: number,"user_id"?: string,"views_count"?: number
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
                },"crowd_war_fans": {
                  Row: {
                    "chat": number,"fixture_id": number,"lineup": boolean,"points": number | null,"posts": number,"predicted": boolean,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat"?: number,"fixture_id": number,"lineup"?: boolean,"points"?: never,"posts"?: number,"predicted"?: boolean,"team_id": string,"user_id": string
                  }
                  Update: {
                    "chat"?: number,"fixture_id"?: number,"lineup"?: boolean,"points"?: never,"posts"?: number,"predicted"?: boolean,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crowd_war_fans_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crowd_war_fans_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"crowd_war_totals": {
                  Row: {
                    "fans": number,"fixture_id": number,"points": number,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fans"?: number,"fixture_id": number,"points"?: number,"team_id": string
                  }
                  Update: {
                    "fans"?: number,"fixture_id"?: number,"points"?: number,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crowd_war_totals_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crowd_war_totals_team_id_fkey"
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
                    "ciphertext": string,"created_at": string,"group_id": string,"id": string,"iv": string,"reply_to": string | null,"sender_device": string,"sender_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"created_at"?: string,"group_id": string,"id"?: string,"iv": string,"reply_to"?: string | null,"sender_device": string,"sender_id"?: string,"wrapped_keys": NonNullable<Json>
                  }
                  Update: {
                    "ciphertext"?: string,"created_at"?: string,"group_id"?: string,"id"?: string,"iv"?: string,"reply_to"?: string | null,"sender_device"?: string,"sender_id"?: string,"wrapped_keys"?: NonNullable<Json>
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
                    "ciphertext": string,"created_at": string,"id": string,"iv": string,"reply_to": string | null,"sender_device": string,"sender_id": string,"thread_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"created_at"?: string,"id"?: string,"iv": string,"reply_to"?: string | null,"sender_device": string,"sender_id"?: string,"thread_id": string,"wrapped_keys": NonNullable<Json>
                  }
                  Update: {
                    "ciphertext"?: string,"created_at"?: string,"id"?: string,"iv"?: string,"reply_to"?: string | null,"sender_device"?: string,"sender_id"?: string,"thread_id"?: string,"wrapped_keys"?: NonNullable<Json>
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
                    "accepted_at": string | null,"created_at": string,"id": string,"last_at": string,"last_from": string | null,"last_message_id": string | null,"nick_a": string,"nick_b": string,"opened_by": string | null,"team_a": string | null,"team_b": string | null,"unread_a": number,"unread_b": number,"user_a": string,"user_b": string,"via_qr": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"nick_a"?: string,"nick_b"?: string,"opened_by"?: string | null,"team_a"?: string | null,"team_b"?: string | null,"unread_a"?: number,"unread_b"?: number,"user_a": string,"user_b": string,"via_qr"?: boolean
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"last_message_id"?: string | null,"nick_a"?: string,"nick_b"?: string,"opened_by"?: string | null,"team_a"?: string | null,"team_b"?: string | null,"unread_a"?: number,"unread_b"?: number,"user_a"?: string,"user_b"?: string,"via_qr"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "dm_threads_team_a_fkey"
      columns: ["team_a"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dm_threads_team_b_fkey"
      columns: ["team_b"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"fan_affinity": {
                  Row: {
                    "dim": string,"key": string,"score": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dim": string,"key": string,"score"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "dim"?: string,"key"?: string,"score"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fan_bans": {
                  Row: {
                    "by_admin": string | null,"created_at": string,"reason": string,"until": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "by_admin"?: string | null,"created_at"?: string,"reason"?: string,"until"?: string | null,"user_id": string
                  }
                  Update: {
                    "by_admin"?: string | null,"created_at"?: string,"reason"?: string,"until"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fan_cars": {
                  Row: {
                    "active": boolean,"checked_at": string,"colour": string,"created_at": string,"id": string,"make": string,"model": string,"plate": string,"user_id": string,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"checked_at"?: string,"colour"?: string,"created_at"?: string,"id"?: string,"make"?: string,"model"?: string,"plate": string,"user_id": string,"year"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"checked_at"?: string,"colour"?: string,"created_at"?: string,"id"?: string,"make"?: string,"model"?: string,"plate"?: string,"user_id"?: string,"year"?: number | null
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
                    "area": string,"created_at": string,"going_count": number,"hidden_at": string | null,"id": string,"kind": string,"nick": string,"note": string,"starts_at": string,"team_id": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"created_at"?: string,"going_count"?: number,"hidden_at"?: string | null,"id"?: string,"kind": string,"nick"?: string,"note"?: string,"starts_at": string,"team_id"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "area"?: string,"created_at"?: string,"going_count"?: number,"hidden_at"?: string | null,"id"?: string,"kind"?: string,"nick"?: string,"note"?: string,"starts_at"?: string,"team_id"?: string,"title"?: string,"user_id"?: string
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
                },"fan_verifications": {
                  Row: {
                    "approved_at": string | null,"counted": boolean,"created_at": string,"doc_fingerprint": string | null,"expires_at": string | null,"id": string,"is_female": boolean | null,"kind": string,"provider": string,"provider_ref": string | null,"reason_code": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"counted"?: boolean,"created_at"?: string,"doc_fingerprint"?: string | null,"expires_at"?: string | null,"id"?: string,"is_female"?: boolean | null,"kind": string,"provider"?: string,"provider_ref"?: string | null,"reason_code"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"counted"?: boolean,"created_at"?: string,"doc_fingerprint"?: string | null,"expires_at"?: string | null,"id"?: string,"is_female"?: boolean | null,"kind"?: string,"provider"?: string,"provider_ref"?: string | null,"reason_code"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
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
                    "category": string,"condition": string,"created_at": string,"hidden_at": string | null,"id": string,"media_path": string | null,"nick": string,"price": number,"size": string,"sold": boolean,"team_id": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"condition": string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"media_path"?: string | null,"nick"?: string,"price": number,"size"?: string,"sold"?: boolean,"team_id"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "category"?: string,"condition"?: string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"media_path"?: string | null,"nick"?: string,"price"?: number,"size"?: string,"sold"?: boolean,"team_id"?: string,"title"?: string,"user_id"?: string
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
                    "away_goals": number,"claimed_at": string | null,"created_at": string,"fixture_id": number,"home_goals": number,"id": number,"kind": string,"scoring_api_id": number | null,"sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_goals": number,"claimed_at"?: string | null,"created_at"?: string,"fixture_id": number,"home_goals": number,"id"?: number,"kind": string,"scoring_api_id"?: number | null,"sent_at"?: string | null
                  }
                  Update: {
                    "away_goals"?: number,"claimed_at"?: string | null,"created_at"?: string,"fixture_id"?: number,"home_goals"?: number,"id"?: number,"kind"?: string,"scoring_api_id"?: number | null,"sent_at"?: string | null
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
                    "body": string,"created_at": string,"fixture_id": number,"hidden_at": string | null,"id": string,"nick": string,"reply_body": string | null,"reply_nick": string | null,"reply_to": string | null,"reply_user": string | null,"side": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"fixture_id": number,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"reply_body"?: string | null,"reply_nick"?: string | null,"reply_to"?: string | null,"reply_user"?: string | null,"side"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"fixture_id"?: number,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"reply_body"?: string | null,"reply_nick"?: string | null,"reply_to"?: string | null,"reply_user"?: string | null,"side"?: string,"team_id"?: string,"user_id"?: string
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
                },"message_reactions": {
                  Row: {
                    "created_at": string,"kind": number,"message_id": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"kind": number,"message_id": string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"kind"?: number,"message_id"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "team_messages"
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
                    "hidden_at": string | null,"likes_count": number,"nick": string,"player_id": string,"review": string,"stars": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hidden_at"?: string | null,"likes_count"?: number,"nick"?: string,"player_id": string,"review"?: string,"stars": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "hidden_at"?: string | null,"likes_count"?: number,"nick"?: string,"player_id"?: string,"review"?: string,"stars"?: number,"updated_at"?: string,"user_id"?: string
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
                    "adult_confirmed_at": string | null,"birth_date": string | null,"clips_posted": number,"created_at": string,"dm_requests": string | null,"gender": string | null,"nick": string,"qr_code": string,"ride_safety_seen_at": string | null,"team_id": string,"terms_version": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adult_confirmed_at"?: string | null,"birth_date"?: string | null,"clips_posted"?: number,"created_at"?: string,"dm_requests"?: string | null,"gender"?: string | null,"nick": string,"qr_code"?: string,"ride_safety_seen_at"?: string | null,"team_id": string,"terms_version"?: string,"user_id": string
                  }
                  Update: {
                    "adult_confirmed_at"?: string | null,"birth_date"?: string | null,"clips_posted"?: number,"created_at"?: string,"dm_requests"?: string | null,"gender"?: string | null,"nick"?: string,"qr_code"?: string,"ride_safety_seen_at"?: string | null,"team_id"?: string,"terms_version"?: string,"user_id"?: string
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
                },"push_throttle": {
                  Row: {
                    "at": string,"scope": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at": string,"scope": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"scope"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"registry_lookups": {
                  Row: {
                    "created_at": string,"id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"note": string,"reason": string,"ref": string,"reporter_id": string | null,"ride_suspended": boolean,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"note"?: string,"reason": string,"ref": string,"reporter_id"?: string | null,"ride_suspended"?: boolean,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"note"?: string,"reason"?: string,"ref"?: string,"reporter_id"?: string | null,"ride_suspended"?: boolean,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ride_completions": {
                  Row: {
                    "created_at": string,"driver_id": string,"fixture_id": number,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"driver_id": string,"fixture_id": number,"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"fixture_id"?: number,"trip_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ride_driver_stats": {
                  Row: {
                    "driver_id": string,"ratings_count": number,"ratings_sum": number,"rides_completed": number
                  }
                  ComputedFields: never
                  Insert: {
                    "driver_id": string,"ratings_count"?: number,"ratings_sum"?: number,"rides_completed"?: number
                  }
                  Update: {
                    "driver_id"?: string,"ratings_count"?: number,"ratings_sum"?: number,"rides_completed"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ride_incidents": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"car_colour": string,"car_make": string,"car_model": string,"car_plate": string,"closed_at": string | null,"closed_by": string | null,"created_at": string,"driver_id": string | null,"fixture_id": number | null,"from_city": string,"id": string,"pickup": string,"reporter_id": string | null,"status": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"car_colour"?: string,"car_make"?: string,"car_model"?: string,"car_plate"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"driver_id"?: string | null,"fixture_id"?: number | null,"from_city"?: string,"id"?: string,"pickup"?: string,"reporter_id"?: string | null,"status"?: string,"trip_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"car_colour"?: string,"car_make"?: string,"car_model"?: string,"car_plate"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"driver_id"?: string | null,"fixture_id"?: number | null,"from_city"?: string,"id"?: string,"pickup"?: string,"reporter_id"?: string | null,"status"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ride_ratings": {
                  Row: {
                    "created_at": string,"driver_id": string,"rater_id": string,"stars": number,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"driver_id": string,"rater_id"?: string,"stars": number,"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"rater_id"?: string,"stars"?: number,"trip_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ride_suspensions": {
                  Row: {
                    "by_report": string | null,"created_at": string,"lifted_at": string | null,"lifted_by": string | null,"reason": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "by_report"?: string | null,"created_at"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason"?: string,"user_id": string
                  }
                  Update: {
                    "by_report"?: string | null,"created_at"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_suspensions_by_report_fkey"
      columns: ["by_report"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    }
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
                    "body": string,"created_at": string,"dislikes": number,"hidden_at": string | null,"id": string,"likes": number,"nick": string,"reply_body": string | null,"reply_nick": string | null,"reply_to": string | null,"reply_user": string | null,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"dislikes"?: number,"hidden_at"?: string | null,"id"?: string,"likes"?: number,"nick"?: string,"reply_body"?: string | null,"reply_nick"?: string | null,"reply_to"?: string | null,"reply_user"?: string | null,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dislikes"?: number,"hidden_at"?: string | null,"id"?: string,"likes"?: number,"nick"?: string,"reply_body"?: string | null,"reply_nick"?: string | null,"reply_to"?: string | null,"reply_user"?: string | null,"team_id"?: string,"user_id"?: string
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
                    "body": string,"created_at": string,"hidden_at": string | null,"id": string,"nick": string,"photo_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"photo_id": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"nick"?: string,"photo_id"?: string,"user_id"?: string
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
                    "caption": string,"comments_count": number,"created_at": string,"hidden_at": string | null,"id": string,"likes_count": number,"media_path": string,"nick": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"likes_count"?: number,"media_path": string,"nick"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Update: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"likes_count"?: number,"media_path"?: string,"nick"?: string,"team_id"?: string,"user_id"?: string
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
                    "cost": string,"created_at": string,"depart_before_min": number,"fixture_id": number,"from_city": string,"hidden_at": string | null,"id": string,"kind": string,"nick": string,"note": string,"pickup": string,"seats": number,"team_id": string,"user_id": string,"women_only": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "cost"?: string,"created_at"?: string,"depart_before_min"?: number,"fixture_id": number,"from_city": string,"hidden_at"?: string | null,"id"?: string,"kind": string,"nick"?: string,"note"?: string,"pickup"?: string,"seats"?: number,"team_id"?: string,"user_id"?: string,"women_only"?: boolean
                  }
                  Update: {
                    "cost"?: string,"created_at"?: string,"depart_before_min"?: number,"fixture_id"?: number,"from_city"?: string,"hidden_at"?: string | null,"id"?: string,"kind"?: string,"nick"?: string,"note"?: string,"pickup"?: string,"seats"?: number,"team_id"?: string,"user_id"?: string,"women_only"?: boolean
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
            "accept_dm_thread":
{ Args: { "p_thread": string }; Returns: undefined
                           },
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
"admin_ack_incident":
{ Args: { "p_id": string }; Returns: boolean
                           },
"admin_ban_list":
{ Args: { "p_limit"?: number }; Returns: {
              "created_at": string,"nick": string,"reason": string,"until": string,"user_id": string
            }[]
                           },
"admin_ban_user":
{ Args: { "p_days"?: number,"p_reason"?: string,"p_user": string }; Returns: string
                           },
"admin_close_incident":
{ Args: { "p_id": string }; Returns: boolean
                           },
"admin_incident_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"admin_lift_ride_suspension":
{ Args: { "p_user": string }; Returns: boolean
                           },
"admin_most_blocked":
{ Args: { "p_limit"?: number }; Returns: {
              "blocked_by": number,"nick": string,"user_id": string
            }[]
                           },
"admin_open_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"admin_open_incidents":
{ Args: { "p_limit"?: number }; Returns: {
              "acknowledged_at": string,"car": string,"created_at": string,"driver_nick": string,"from_city": string,"id": string,"kickoff_at": string,"pickup": string,"reporter_nick": string,"trip_id": string
            }[]
                           },
"admin_recent_actions":
{ Args: { "p_limit"?: number }; Returns: {
              "action": string,"admin_nick": string,"created_at": string,"id": number,"kind": string,"note": string,"ref": string,"target_nick": string,"target_user": string
            }[]
                           },
"admin_remove_content":
{ Args: { "p_kind": string,"p_ref": string }; Returns: {
              "bucket": string,"path": string,"removed": boolean
            }[]
                           },
"admin_report_queue":
{ Args: { "p_before"?: string,"p_before_id"?: string,"p_limit"?: number,"p_status"?: string }; Returns: {
              "created_at": string,"id": string,"kind": string,"note": string,"open_reports_on_target": number,"reason": string,"ref": string,"reporter_contact": string,"reporter_nick": string,"status": string,"target_exists": boolean,"target_hidden": boolean,"target_nick": string,"target_preview": string,"target_user_id": string
            }[]
                           },
"admin_reset_verification":
{ Args: { "p_kind": string,"p_user": string }; Returns: number
                           },
"admin_restore_content":
{ Args: { "p_kind": string,"p_ref": string }; Returns: boolean
                           },
"admin_ride_suspensions":
{ Args: { "p_limit"?: number }; Returns: {
              "by_report": string,"created_at": string,"nick": string,"reason": string,"user_id": string
            }[]
                           },
"admin_set_birth_date":
{ Args: { "p_date": string,"p_user": string }; Returns: undefined
                           },
"admin_set_gender":
{ Args: { "p_gender": string,"p_user": string }; Returns: undefined
                           },
"admin_set_report_status":
{ Args: { "p_report": string,"p_status": string }; Returns: undefined
                           },
"admin_unban_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_user_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"admin_verification_issues":
{ Args: { "p_limit"?: number }; Returns: {
              "created_at": string,"kind": string,"nick": string,"reason_code": string,"used": number,"user_id": string
            }[]
                           },
"alert_recipients":
{ Args: { "p_after"?: string,"p_fixture": number,"p_limit"?: number }; Returns: string[]
                           },
"answer_invite":
{ Args: { "p_group": string,"p_yes": boolean }; Returns: undefined
                           },
"begin_verification":
{ Args: { "p_kind": string }; Returns: string
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
"claimed_at": string | null,
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
"claim_message_push":
{ Args: { "p_id": string,"p_kind": string }; Returns: boolean
                           },
"claim_registry_lookup":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
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
"crowd_war_record":
{ Args: { "p_season": number,"p_team": string }; Returns: {
              "draws": number,"losses": number,"wins": number
            }[]
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
"is_app_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"mark_alerts_sent":
{ Args: { "p_ids": (number)[] }; Returns: undefined
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
"moderate_name":
{ Args: { "p": string }; Returns: string
                           },
"moderate_text":
{ Args: { "p": string }; Returns: string
                           },
"mute_group":
{ Args: { "p_group": string,"p_muted": boolean }; Returns: undefined
                           },
"my_ban_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_groups":
{ Args: { "with_invites": boolean }; Returns: string[]
                           },
"my_private_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "birth_date": string,"dm_requests": string,"qr_code": string
            }[]
                           },
"my_ride_case_open":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_ride_plates":
{ Args: { "p_trips": (string)[] }; Returns: {
              "driver_id": string,"plate": string,"trip_id": string
            }[]
                           },
"my_ride_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "adult_confirmed": boolean,"gender": string,"phone_ok": boolean,"phone_required": boolean,"ride_suspended": boolean,"safety_seen": boolean
            }[]
                           },
"my_rides_to_rate":
{ Args: Record<PropertyKey, never>; Returns: {
              "driver_nick": string,"kickoff_at": string,"trip_id": string
            }[]
                           },
"my_team":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_verification":
{ Args: Record<PropertyKey, never>; Returns: {
              "car_colour": string,"car_make": string,"car_model": string,"car_plate": string,"car_year": number,"identity_left": number,"identity_reason": string,"identity_status": string,"licence_left": number,"licence_reason": string,"licence_status": string,"required": boolean
            }[]
                           },
"my_verification_session":
{ Args: { "p_session": string }; Returns: string
                           },
"open_dm_by_code":
{ Args: { "p_code": string }; Returns: string
                           },
"open_event_poll":
{ Args: { "p_fixture": number,"p_kind": string,"p_options": Json,"p_options_in": Json,"p_question": string,"p_scope": string }; Returns: string
                           },
"orphan_clip_objects":
{ Args: { "p_limit"?: number }; Returns: {
              "name": string
            }[]
                           },
"qr_card":
{ Args: { "p_code": string }; Returns: {
              "nick": string,"team_id": string
            }[]
                           },
"remove_from_group":
{ Args: { "p_group": string,"p_user": string }; Returns: undefined
                           },
"remove_my_car":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rename_group":
{ Args: { "p_group": string,"p_name": string }; Returns: undefined
                           },
"report_ride_emergency":
{ Args: { "p_trip": string }; Returns: {
              "created": boolean,"fixture_id": number,"from_city": string,"incident_id": string
            }[]
                           },
"report_ride_harm":
{ Args: { "p_kind": string,"p_note"?: string,"p_ref": string }; Returns: {
              "report_id": string,"suspended": boolean
            }[]
                           },
"request_dm":
{ Args: { "p_other": string }; Returns: string
                           },
"reset_qr_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ride_drivers":
{ Args: { "p_users": (string)[] }; Returns: {
              "female": boolean,"member_since": string,"ratings_count": number,"ratings_sum": number,"rides_completed": number,"user_id": string
            }[]
                           },
"ride_suspension_riders":
{ Args: { "p_report": string }; Returns: string[]
                           },
"ride_trust":
{ Args: { "p_users": (string)[] }; Returns: {
              "car_colour": string,"car_make": string,"car_model": string,"driver_ok": boolean,"identity_ok": boolean,"user_id": string
            }[]
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
                           },
"set_birth_date":
{ Args: { "p_date": string }; Returns: undefined
                           },
"set_dm_requests":
{ Args: { "p_value": string }; Returns: undefined
                           },
"set_fan_car":
{ Args: { "p_colour": string,"p_make": string,"p_model": string,"p_plate": string,"p_user": string,"p_year"?: number }; Returns: undefined
                           },
"verification_result":
{ Args: { "p_approved": boolean,"p_doc_birth_date"?: string,"p_doc_expires"?: string,"p_fingerprint"?: string,"p_licence_issued"?: string,"p_provider": string,"p_provider_ref": string,"p_reason"?: string,"p_session": string }; Returns: string
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
