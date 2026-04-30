export type AthleteHit = {
  id: string;
  display_name: string;
  birth_year?: number | null;
  gender?: string | null;
};

export type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";
// Replace your AthleteResultRow interface in src/components/utovere/types.ts

export interface AthleteResultRow {
  race_id:            string;
  race_name:          string;
  event_name:         string;
  start_date:         string | null;
  location:           string | null;
  time_ms:            number;
  distance_category:  string | null;
  club:               string | null;
  bib:                string | null;
  rank_overall:       number | null;
  rank_gender:        number | null;
  total_finishers:    number | null;
  total_finishers_m:  number | null;
  total_finishers_f:  number | null;
}

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