
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
            "my_team":
{ Args: Record<PropertyKey, never>; Returns: string
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
