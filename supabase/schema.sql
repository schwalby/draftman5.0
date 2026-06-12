--
-- PostgreSQL database dump
--

\restrict rTjFRwohLaO8W5oVCasNzwx2mtvhIJ4dTN2Itqf7WPwGxdWuig31xcduFH77TjZ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: draft_lobby; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_lobby (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id text NOT NULL,
    ready_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: draft_picks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_picks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pick_number integer NOT NULL,
    class text,
    picked_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'draft'::text NOT NULL,
    format text DEFAULT '6v6'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    half_length integer DEFAULT 20,
    maps text[] DEFAULT '{}'::text[],
    slots_rifle integer DEFAULT 2,
    slots_third integer DEFAULT 0,
    slots_light integer DEFAULT 1,
    slots_heavy integer DEFAULT 2,
    slots_sniper integer DEFAULT 1,
    capacity integer DEFAULT 60,
    starts_at timestamp with time zone,
    checkin_opens_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    signup_opens_at timestamp with time zone,
    stream_url text
);


--
-- Name: map_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_pool (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    map_name text NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    times_played integer DEFAULT 0
);


--
-- Name: rules_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rules_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid,
    content text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rules_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rules_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    class text[] NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    priority integer DEFAULT 0,
    flagged boolean DEFAULT false,
    admin_note text,
    checked_in boolean DEFAULT false,
    signed_up_at timestamp with time zone DEFAULT now(),
    ringer boolean DEFAULT false,
    captain boolean DEFAULT false
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    captain_id uuid,
    pick_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournament_group_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_group_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid,
    team_id uuid,
    seed integer
);


--
-- Name: tournament_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournament_match_edits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_match_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid,
    edited_by uuid,
    source text DEFAULT 'admin'::text NOT NULL,
    prev_winner_id uuid,
    prev_score_team1 integer,
    prev_score_team2 integer,
    new_winner_id uuid,
    new_score_team1 integer,
    new_score_team2 integer,
    note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournament_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid,
    group_id uuid,
    stage text DEFAULT 'group'::text NOT NULL,
    round integer,
    match_number integer,
    team1_id uuid,
    team2_id uuid,
    winner_id uuid,
    score_team1 integer,
    score_team2 integer,
    map text,
    status text DEFAULT 'pending'::text NOT NULL,
    next_match_id uuid,
    ktp_match_id text,
    scheduled_at timestamp with time zone,
    played_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    confirmed boolean DEFAULT false,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    score_half1_team1 integer,
    score_half1_team2 integer,
    score_half2_team1 integer,
    score_half2_team2 integer
);


--
-- Name: tournament_standings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_standings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid,
    group_id uuid,
    team_id uuid,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    points_for integer DEFAULT 0 NOT NULL,
    points_against integer DEFAULT 0 NOT NULL,
    seed integer,
    seed_override integer,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    format text DEFAULT 'rr_elimination'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    num_groups integer DEFAULT 2 NOT NULL,
    teams_per_group integer DEFAULT 4 NOT NULL,
    rounds_per_group integer DEFAULT 5 NOT NULL,
    num_advance integer DEFAULT 4 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    champion_team_id uuid
);


--
-- Name: twelve_man_captain_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twelve_man_captain_cooldowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    games_remaining integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: twelve_man_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twelve_man_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    queue_size integer DEFAULT 12 NOT NULL,
    timeout_minutes integer DEFAULT 90 NOT NULL,
    activity_window_minutes integer DEFAULT 5 NOT NULL,
    sub_window_minutes integer DEFAULT 2 NOT NULL,
    captain_cooldown_games integer DEFAULT 2 NOT NULL,
    map_count integer DEFAULT 0 NOT NULL,
    vote_threshold integer DEFAULT 7 NOT NULL,
    captain_vote_seconds integer DEFAULT 120 NOT NULL,
    map_vote_seconds integer DEFAULT 90 NOT NULL,
    server_vote_seconds integer DEFAULT 90 NOT NULL,
    vote_order text[] DEFAULT ARRAY['captain'::text, 'map'::text, 'server'::text, 'draft'::text] NOT NULL,
    draft_pattern text DEFAULT '1-2-2-2-2-2-1'::text NOT NULL,
    server_locations text[] DEFAULT ARRAY['Atlanta'::text, 'Chicago'::text, 'Dallas'::text, 'Denver'::text, 'New York'::text] NOT NULL,
    queue_channel_id text,
    score_channel_id text,
    log_channel_id text,
    mod_log_channel_id text
);


--
-- Name: twelve_man_queue_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twelve_man_queue_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    is_waitlist boolean DEFAULT false NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discord_id text NOT NULL,
    discord_username text NOT NULL,
    discord_avatar text,
    ingame_name text,
    is_organizer boolean DEFAULT false,
    is_captain boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_superuser boolean DEFAULT false,
    steam_id text,
    steam_name text,
    steam_avatar text,
    steam_id_64 text,
    steam_verified boolean DEFAULT false
);


--
-- Name: verify_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verify_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discord_id text NOT NULL,
    discord_username text NOT NULL,
    token text NOT NULL,
    used boolean DEFAULT false,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: draft_lobby draft_lobby_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_lobby
    ADD CONSTRAINT draft_lobby_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: draft_lobby draft_lobby_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_lobby
    ADD CONSTRAINT draft_lobby_pkey PRIMARY KEY (id);


--
-- Name: draft_picks draft_picks_event_pick_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_event_pick_unique UNIQUE (event_id, pick_number);


--
-- Name: draft_picks draft_picks_event_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_event_user_unique UNIQUE (event_id, user_id);


--
-- Name: draft_picks draft_picks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: map_pool map_pool_guild_id_map_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.map_pool
    ADD CONSTRAINT map_pool_guild_id_map_name_key UNIQUE (guild_id, map_name);


--
-- Name: map_pool map_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.map_pool
    ADD CONSTRAINT map_pool_pkey PRIMARY KEY (id);


--
-- Name: maps maps_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maps
    ADD CONSTRAINT maps_name_key UNIQUE (name);


--
-- Name: maps maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maps
    ADD CONSTRAINT maps_pkey PRIMARY KEY (id);


--
-- Name: rules_items rules_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules_items
    ADD CONSTRAINT rules_items_pkey PRIMARY KEY (id);


--
-- Name: rules_sections rules_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules_sections
    ADD CONSTRAINT rules_sections_pkey PRIMARY KEY (id);


--
-- Name: signups signups_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signups
    ADD CONSTRAINT signups_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: signups signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signups
    ADD CONSTRAINT signups_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: tournament_group_teams tournament_group_teams_group_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_group_teams
    ADD CONSTRAINT tournament_group_teams_group_id_team_id_key UNIQUE (group_id, team_id);


--
-- Name: tournament_group_teams tournament_group_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_group_teams
    ADD CONSTRAINT tournament_group_teams_pkey PRIMARY KEY (id);


--
-- Name: tournament_groups tournament_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_groups
    ADD CONSTRAINT tournament_groups_pkey PRIMARY KEY (id);


--
-- Name: tournament_match_edits tournament_match_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_edits
    ADD CONSTRAINT tournament_match_edits_pkey PRIMARY KEY (id);


--
-- Name: tournament_matches tournament_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_pkey PRIMARY KEY (id);


--
-- Name: tournament_standings tournament_standings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_standings
    ADD CONSTRAINT tournament_standings_pkey PRIMARY KEY (id);


--
-- Name: tournament_standings tournament_standings_tournament_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_standings
    ADD CONSTRAINT tournament_standings_tournament_id_team_id_key UNIQUE (tournament_id, team_id);


--
-- Name: tournaments tournaments_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_event_id_unique UNIQUE (event_id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: twelve_man_captain_cooldowns twelve_man_captain_cooldowns_discord_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_captain_cooldowns
    ADD CONSTRAINT twelve_man_captain_cooldowns_discord_user_id_key UNIQUE (discord_user_id);


--
-- Name: twelve_man_captain_cooldowns twelve_man_captain_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_captain_cooldowns
    ADD CONSTRAINT twelve_man_captain_cooldowns_pkey PRIMARY KEY (id);


--
-- Name: twelve_man_config twelve_man_config_guild_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_config
    ADD CONSTRAINT twelve_man_config_guild_id_key UNIQUE (guild_id);


--
-- Name: twelve_man_config twelve_man_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_config
    ADD CONSTRAINT twelve_man_config_pkey PRIMARY KEY (id);


--
-- Name: twelve_man_queue_state twelve_man_queue_state_discord_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_queue_state
    ADD CONSTRAINT twelve_man_queue_state_discord_user_id_key UNIQUE (discord_user_id);


--
-- Name: twelve_man_queue_state twelve_man_queue_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twelve_man_queue_state
    ADD CONSTRAINT twelve_man_queue_state_pkey PRIMARY KEY (id);


--
-- Name: users users_discord_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_discord_id_key UNIQUE (discord_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_steam_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_steam_id_key UNIQUE (steam_id);


--
-- Name: verify_tokens verify_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verify_tokens
    ADD CONSTRAINT verify_tokens_pkey PRIMARY KEY (id);


--
-- Name: verify_tokens verify_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verify_tokens
    ADD CONSTRAINT verify_tokens_token_key UNIQUE (token);


--
-- Name: verify_tokens_discord_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_tokens_discord_id_idx ON public.verify_tokens USING btree (discord_id);


--
-- Name: verify_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_tokens_token_idx ON public.verify_tokens USING btree (token);


--
-- Name: draft_lobby draft_lobby_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_lobby
    ADD CONSTRAINT draft_lobby_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: draft_picks draft_picks_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: draft_picks draft_picks_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: draft_picks draft_picks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_picks
    ADD CONSTRAINT draft_picks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: rules_items rules_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules_items
    ADD CONSTRAINT rules_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.rules_sections(id) ON DELETE CASCADE;


--
-- Name: signups signups_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signups
    ADD CONSTRAINT signups_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: signups signups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signups
    ADD CONSTRAINT signups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.users(id);


--
-- Name: teams teams_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: tournament_group_teams tournament_group_teams_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_group_teams
    ADD CONSTRAINT tournament_group_teams_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id) ON DELETE CASCADE;


--
-- Name: tournament_group_teams tournament_group_teams_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_group_teams
    ADD CONSTRAINT tournament_group_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: tournament_groups tournament_groups_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_groups
    ADD CONSTRAINT tournament_groups_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_match_edits tournament_match_edits_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_edits
    ADD CONSTRAINT tournament_match_edits_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tournament_match_edits tournament_match_edits_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_edits
    ADD CONSTRAINT tournament_match_edits_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.tournament_matches(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_next_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_next_match_id_fkey FOREIGN KEY (next_match_id) REFERENCES public.tournament_matches(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_team1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_team2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: tournament_standings tournament_standings_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_standings
    ADD CONSTRAINT tournament_standings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id) ON DELETE CASCADE;


--
-- Name: tournament_standings tournament_standings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_standings
    ADD CONSTRAINT tournament_standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: tournament_standings tournament_standings_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_standings
    ADD CONSTRAINT tournament_standings_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournaments tournaments_champion_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_champion_team_id_fkey FOREIGN KEY (champion_team_id) REFERENCES public.teams(id);


--
-- Name: tournaments tournaments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: tournament_match_edits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_match_edits ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict rTjFRwohLaO8W5oVCasNzwx2mtvhIJ4dTN2Itqf7WPwGxdWuig31xcduFH77TjZ

