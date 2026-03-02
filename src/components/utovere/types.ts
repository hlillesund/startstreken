export type AthleteHit = {
  id: string;
  display_name: string;
  birth_year?: number | null;
};

export type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

export type AthleteResultRow = {
  start_date: string | null;
  event_name: string;
  race_name: string;
  time_ms: number;
  club?: string | null;
  distance_category?: DistanceCategory | null;
};

export type LeaderboardRow = {
  rank: number;
  athlete_id: string;
  display_name: string;
  birth_year?: number | null;
  club?: string | null;
  best_time_ms: number;
  best_date: string | null;
  best_event_name?: string | null;
};