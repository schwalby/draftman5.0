alter table tournament_matches
  add column if not exists score_half1_team1 integer,
  add column if not exists score_half1_team2 integer,
  add column if not exists score_half2_team1 integer,
  add column if not exists score_half2_team2 integer;
