
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_teams": {
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
                    "caption": string,"comments_count": number,"created_at": string,"expires_at": string,"id": string,"kind": string,"likes_count": number,"media_path": string,"nick": string,"once": boolean,"respects_count": number,"tags": string,"team_id": string,"user_id": string,"views_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind": string,"likes_count"?: number,"media_path": string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"tags"?: string,"team_id"?: string,"user_id"?: string,"views_count"?: number
                  }
                  Update: {
                    "caption"?: string,"comments_count"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: string,"likes_count"?: number,"media_path"?: string,"nick"?: string,"once"?: boolean,"respects_count"?: number,"tags"?: string,"team_id"?: string,"user_id"?: string,"views_count"?: number
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
                    "created_at": string,"id": string,"last_at": string,"last_from": string | null,"nick_a": string,"nick_b": string,"user_a": string,"user_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"nick_a"?: string,"nick_b"?: string,"user_a": string,"user_b": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_at"?: string,"last_from"?: string | null,"nick_a"?: string,"nick_b"?: string,"user_a"?: string,"user_b"?: string
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
                    "away_api_id": number,"away_goals": number | null,"elapsed": number | null,"home_api_id": number,"home_goals": number | null,"id": number,"kickoff_at": string,"league_id": number,"round": string,"season": number,"status": string,"updated_at": string,"venue": string
                  }
                  ComputedFields: never
                  Insert: {
                    "away_api_id": number,"away_goals"?: number | null,"elapsed"?: number | null,"home_api_id": number,"home_goals"?: number | null,"id": number,"kickoff_at": string,"league_id": number,"round": string,"season": number,"status": string,"updated_at"?: string,"venue"?: string
                  }
                  Update: {
                    "away_api_id"?: number,"away_goals"?: number | null,"elapsed"?: number | null,"home_api_id"?: number,"home_goals"?: number | null,"id"?: number,"kickoff_at"?: string,"league_id"?: number,"round"?: string,"season"?: number,"status"?: string,"updated_at"?: string,"venue"?: string
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
                    "nick": string,"player_id": string,"review": string,"stars": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "nick"?: string,"player_id": string,"review"?: string,"stars": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "nick"?: string,"player_id"?: string,"review"?: string,"stars"?: number,"updated_at"?: string,"user_id"?: string
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "blocked_between":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"clip_seen":
{ Args: { "p_clip": string }; Returns: boolean
                           },
"club_of_api":
{ Args: { "p_api_id": number }; Returns: string
                           },
"match_room_open":
{ Args: { "p_at"?: string,"p_kickoff": string }; Returns: boolean
                           },
"my_team":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"same_team":
{ Args: { "other": string }; Returns: boolean
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
