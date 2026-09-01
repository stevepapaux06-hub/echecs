export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          cadence: string
          created_at: string
          exercises: Json
          game_ids: string[]
          id: string
          metrics: Json
          requested_games: number
          source: string
          title: string
          user_id: string
          warnings: Json
        }
        Insert: {
          cadence: string
          created_at?: string
          exercises?: Json
          game_ids?: string[]
          id?: string
          metrics: Json
          requested_games: number
          source: string
          title: string
          user_id: string
          warnings?: Json
        }
        Update: {
          cadence?: string
          created_at?: string
          exercises?: Json
          game_ids?: string[]
          id?: string
          metrics?: Json
          requested_games?: number
          source?: string
          title?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: []
      }
      chess_profiles: {
        Row: {
          blitz_rating: number | null
          bullet_rating: number | null
          chess_username: string | null
          created_at: string
          daily_rating: number | null
          display_name: string | null
          id: string
          rapid_rating: number | null
          updated_at: string
        }
        Insert: {
          blitz_rating?: number | null
          bullet_rating?: number | null
          chess_username?: string | null
          created_at?: string
          daily_rating?: number | null
          display_name?: string | null
          id: string
          rapid_rating?: number | null
          updated_at?: string
        }
        Update: {
          blitz_rating?: number | null
          bullet_rating?: number | null
          chess_username?: string | null
          created_at?: string
          daily_rating?: number | null
          display_name?: string | null
          id?: string
          rapid_rating?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      concept_stats: {
        Row: {
          baseline_game_opportunities: number
          baseline_game_successes: number
          concept_slug: string
          created_at: string
          failures: number
          game_opportunities: number
          game_successes: number
          id: string
          last_seen_at: string | null
          last_trained_at: string | null
          mastery_score: number | null
          opportunities: number
          successes: number
          training_attempts: number
          training_successes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_game_opportunities?: number
          baseline_game_successes?: number
          concept_slug: string
          created_at?: string
          failures?: number
          game_opportunities?: number
          game_successes?: number
          id?: string
          last_seen_at?: string | null
          last_trained_at?: string | null
          mastery_score?: number | null
          opportunities?: number
          successes?: number
          training_attempts?: number
          training_successes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_game_opportunities?: number
          baseline_game_successes?: number
          concept_slug?: string
          created_at?: string
          failures?: number
          game_opportunities?: number
          game_successes?: number
          id?: string
          last_seen_at?: string | null
          last_trained_at?: string | null
          mastery_score?: number | null
          opportunities?: number
          successes?: number
          training_attempts?: number
          training_successes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_attempts: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_key: string
          id: string
          loss_cp: number | null
          moves: Json
          result: string
          theme: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_key: string
          id?: string
          loss_cp?: number | null
          moves?: Json
          result: string
          theme: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_key?: string
          id?: string
          loss_cp?: number | null
          moves?: Json
          result?: string
          theme?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          analysis_id: string | null
          created_at: string
          exercise_key: string
          fen: string
          id: string
          origin: string
          payload: Json
          theme: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          exercise_key: string
          fen: string
          id?: string
          origin: string
          payload: Json
          theme: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          exercise_key?: string
          fen?: string
          id?: string
          origin?: string
          payload?: Json
          theme?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          analysis_summary: Json | null
          analyzed_at: string | null
          chess_username: string | null
          external_id: string
          id: string
          imported_at: string
          parsed_game: Json
          pgn: string
          played_at: string | null
          player_color: string | null
          result: string | null
          source: string
          time_class: string | null
          time_control: string | null
          user_id: string
        }
        Insert: {
          analysis_summary?: Json | null
          analyzed_at?: string | null
          chess_username?: string | null
          external_id: string
          id?: string
          imported_at?: string
          parsed_game: Json
          pgn: string
          played_at?: string | null
          player_color?: string | null
          result?: string | null
          source: string
          time_class?: string | null
          time_control?: string | null
          user_id: string
        }
        Update: {
          analysis_summary?: Json | null
          analyzed_at?: string | null
          chess_username?: string | null
          external_id?: string
          id?: string
          imported_at?: string
          parsed_game?: Json
          pgn?: string
          played_at?: string | null
          player_color?: string | null
          result?: string | null
          source?: string
          time_class?: string | null
          time_control?: string | null
          user_id?: string
        }
        Relationships: []
      }
      progress_snapshots: {
        Row: {
          analysis_id: string | null
          created_at: string
          id: string
          metrics: Json
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          id?: string
          metrics: Json
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_snapshots_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      weaknesses: {
        Row: {
          confidence: string
          details: Json
          first_seen_at: string
          id: string
          issue_count: number
          last_seen_at: string
          sample_size: number
          status: string
          theme: string
          title: string
          user_id: string
        }
        Insert: {
          confidence: string
          details?: Json
          first_seen_at?: string
          id?: string
          issue_count?: number
          last_seen_at?: string
          sample_size?: number
          status?: string
          theme: string
          title: string
          user_id: string
        }
        Update: {
          confidence?: string
          details?: Json
          first_seen_at?: string
          id?: string
          issue_count?: number
          last_seen_at?: string
          sample_size?: number
          status?: string
          theme?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
