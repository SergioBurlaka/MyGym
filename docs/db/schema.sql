--
-- PostgreSQL database dump
--

\restrict Fb3H4PmSvATJTCx14aCmuQrZR08eSLRUIt4kKVvG17clR3y5XYjwEnIThgkxt8N

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: equipment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equipment AS ENUM (
    'barbell',
    'dumbbell',
    'bodyweight'
);


--
-- Name: limb; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.limb AS ENUM (
    'arm',
    'leg'
);


--
-- Name: muscle_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.muscle_category AS ENUM (
    'large',
    'small',
    'bodyweight'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    grant_id uuid,
    CONSTRAINT api_tokens_kind_check CHECK (((grant_id IS NULL) = (expires_at IS NULL)))
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    equipment public.equipment NOT NULL,
    category public.muscle_category NOT NULL,
    rep_range_min smallint NOT NULL,
    rep_range_max smallint NOT NULL,
    weight_step_kg numeric(5,2) DEFAULT 0.5 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    try_more_counter_adjust smallint DEFAULT 0 NOT NULL,
    try_more_counter_anchor date,
    unilateral boolean DEFAULT false NOT NULL,
    limb public.limb,
    default_bar_kg numeric(5,2),
    CONSTRAINT exercises_default_bar_check CHECK (((default_bar_kg IS NULL) OR (((default_bar_kg >= (0)::numeric) AND (default_bar_kg <= (50)::numeric)) AND (equipment = 'barbell'::public.equipment)))),
    CONSTRAINT exercises_limb_check CHECK (((limb IS NULL) OR unilateral)),
    CONSTRAINT exercises_rep_range_check CHECK (((rep_range_min >= 1) AND (rep_range_max <= 100) AND (rep_range_min <= rep_range_max))),
    CONSTRAINT exercises_weight_step_check CHECK (((weight_step_kg >= (0)::numeric) AND (weight_step_kg <= (50)::numeric)))
);


--
-- Name: oauth_authorization_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_authorization_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    client_name text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    state text,
    resource text NOT NULL,
    scope text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    user_id uuid,
    code_hash text,
    code_expires_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    browser_hash text NOT NULL,
    client_logo_uri text
);


--
-- Name: oauth_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_clients (
    id text NOT NULL,
    client_secret_hash text,
    token_endpoint_auth_method text NOT NULL,
    client_name text NOT NULL,
    client_uri text,
    redirect_uris jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_id text NOT NULL,
    client_name text NOT NULL,
    resource text NOT NULL,
    scope text NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_logo_uri text
);


--
-- Name: oauth_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grant_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: program_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    order_index smallint DEFAULT 0 NOT NULL,
    target_sets smallint DEFAULT 3 NOT NULL,
    try_more_after_workouts smallint,
    lock_sets boolean DEFAULT false NOT NULL,
    CONSTRAINT program_exercises_target_sets_check CHECK (((target_sets >= 1) AND (target_sets <= 20))),
    CONSTRAINT program_exercises_try_more_check CHECK (((try_more_after_workouts >= 1) AND (try_more_after_workouts <= 60)))
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_index smallint DEFAULT 0 NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_exercise_id uuid NOT NULL,
    set_number smallint NOT NULL,
    reps smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sets_reps_check CHECK (((reps >= 0) AND (reps <= 200))),
    CONSTRAINT sets_set_number_check CHECK ((set_number >= 1))
);


--
-- Name: training_schedule_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_schedule_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    training_days jsonb NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    training_days jsonb DEFAULT '[1, 3, 5]'::jsonb NOT NULL,
    google_sub text,
    training_time text DEFAULT '18:00'::text NOT NULL,
    training_duration_min smallint DEFAULT 60 NOT NULL,
    timezone text DEFAULT 'Europe/Kyiv'::text NOT NULL,
    calendar_feed_token_hash text,
    calendar_feed_created_at timestamp with time zone,
    is_demo boolean DEFAULT false NOT NULL,
    demo_reset_at timestamp with time zone,
    CONSTRAINT users_training_duration_min_check CHECK (((training_duration_min >= 15) AND (training_duration_min <= 300)))
);


--
-- Name: workout_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    weight_per_unit_kg numeric(6,2),
    weight_units smallint,
    order_index smallint DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bar_kg numeric(5,2),
    CONSTRAINT workout_exercises_bar_check CHECK (((bar_kg >= (0)::numeric) AND (bar_kg <= (50)::numeric))),
    CONSTRAINT workout_exercises_weight_check CHECK (((weight_per_unit_kg >= (0)::numeric) AND (weight_per_unit_kg <= (500)::numeric))),
    CONSTRAINT workout_exercises_weight_units_check CHECK (((weight_units IS NULL) OR ((weight_units = ANY (ARRAY[1, 2])) AND (weight_per_unit_kg IS NOT NULL))))
);


--
-- Name: workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_label text,
    program_id uuid,
    auto_finished boolean DEFAULT false NOT NULL,
    paused_ms integer DEFAULT 0 NOT NULL,
    paused_at timestamp with time zone,
    resumed_at timestamp with time zone,
    is_sample boolean DEFAULT false NOT NULL,
    CONSTRAINT workouts_paused_ms_check CHECK ((paused_ms >= 0)),
    CONSTRAINT workouts_paused_open_check CHECK (((paused_at IS NULL) OR (time_end IS NULL)))
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorization_requests oauth_authorization_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_authorization_requests
    ADD CONSTRAINT oauth_authorization_requests_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_grants oauth_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_pkey PRIMARY KEY (id);


--
-- Name: oauth_refresh_tokens oauth_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_refresh_tokens
    ADD CONSTRAINT oauth_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: program_exercises program_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercises
    ADD CONSTRAINT program_exercises_pkey PRIMARY KEY (id);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);


--
-- Name: training_schedule_history training_schedule_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_schedule_history
    ADD CONSTRAINT training_schedule_history_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workout_exercises workout_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_pkey PRIMARY KEY (id);


--
-- Name: workouts workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);


--
-- Name: api_tokens_grant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_tokens_grant_idx ON public.api_tokens USING btree (grant_id);


--
-- Name: api_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_tokens_token_hash_idx ON public.api_tokens USING btree (token_hash);


--
-- Name: api_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_tokens_user_idx ON public.api_tokens USING btree (user_id);


--
-- Name: exercises_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exercises_user_idx ON public.exercises USING btree (user_id);


--
-- Name: exercises_user_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exercises_user_name_idx ON public.exercises USING btree (user_id, lower(btrim(name)));


--
-- Name: oauth_authorization_requests_code_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX oauth_authorization_requests_code_hash_idx ON public.oauth_authorization_requests USING btree (code_hash);


--
-- Name: oauth_grants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_grants_user_idx ON public.oauth_grants USING btree (user_id);


--
-- Name: oauth_refresh_tokens_grant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_refresh_tokens_grant_idx ON public.oauth_refresh_tokens USING btree (grant_id);


--
-- Name: oauth_refresh_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX oauth_refresh_tokens_token_hash_idx ON public.oauth_refresh_tokens USING btree (token_hash);


--
-- Name: program_exercises_exercise_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_exercises_exercise_idx ON public.program_exercises USING btree (exercise_id);


--
-- Name: program_exercises_program_exercise_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX program_exercises_program_exercise_idx ON public.program_exercises USING btree (program_id, exercise_id);


--
-- Name: program_exercises_program_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_exercises_program_idx ON public.program_exercises USING btree (program_id);


--
-- Name: programs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX programs_user_idx ON public.programs USING btree (user_id);


--
-- Name: refresh_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_token_hash_idx ON public.refresh_tokens USING btree (token_hash);


--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: sets_workout_exercise_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sets_workout_exercise_idx ON public.sets USING btree (workout_exercise_id);


--
-- Name: sets_workout_exercise_set_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sets_workout_exercise_set_number_idx ON public.sets USING btree (workout_exercise_id, set_number);


--
-- Name: training_schedule_history_user_effective_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX training_schedule_history_user_effective_from_idx ON public.training_schedule_history USING btree (user_id, effective_from);


--
-- Name: training_schedule_history_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_schedule_history_user_idx ON public.training_schedule_history USING btree (user_id);


--
-- Name: users_calendar_feed_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_calendar_feed_token_idx ON public.users USING btree (calendar_feed_token_hash);


--
-- Name: users_demo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_demo_idx ON public.users USING btree (is_demo) WHERE is_demo;


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (lower(email));


--
-- Name: users_google_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_google_sub_idx ON public.users USING btree (google_sub);


--
-- Name: workout_exercises_exercise_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_exercises_exercise_idx ON public.workout_exercises USING btree (exercise_id);


--
-- Name: workout_exercises_workout_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_exercises_workout_idx ON public.workout_exercises USING btree (workout_id);


--
-- Name: workouts_user_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workouts_user_date_idx ON public.workouts USING btree (user_id, date);


--
-- Name: workouts_user_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workouts_user_label_idx ON public.workouts USING btree (user_id, program_label);


--
-- Name: api_tokens api_tokens_grant_id_oauth_grants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_grant_id_oauth_grants_id_fk FOREIGN KEY (grant_id) REFERENCES public.oauth_grants(id) ON DELETE CASCADE;


--
-- Name: api_tokens api_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorization_requests oauth_authorization_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_authorization_requests
    ADD CONSTRAINT oauth_authorization_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_grants oauth_grants_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_grants
    ADD CONSTRAINT oauth_grants_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_refresh_tokens oauth_refresh_tokens_grant_id_oauth_grants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_refresh_tokens
    ADD CONSTRAINT oauth_refresh_tokens_grant_id_oauth_grants_id_fk FOREIGN KEY (grant_id) REFERENCES public.oauth_grants(id) ON DELETE CASCADE;


--
-- Name: program_exercises program_exercises_exercise_id_exercises_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercises
    ADD CONSTRAINT program_exercises_exercise_id_exercises_id_fk FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: program_exercises program_exercises_program_id_programs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercises
    ADD CONSTRAINT program_exercises_program_id_programs_id_fk FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: programs programs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sets sets_workout_exercise_id_workout_exercises_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_workout_exercise_id_workout_exercises_id_fk FOREIGN KEY (workout_exercise_id) REFERENCES public.workout_exercises(id) ON DELETE CASCADE;


--
-- Name: training_schedule_history training_schedule_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_schedule_history
    ADD CONSTRAINT training_schedule_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workout_exercises workout_exercises_exercise_id_exercises_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_exercise_id_exercises_id_fk FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workout_exercises workout_exercises_workout_id_workouts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_workout_id_workouts_id_fk FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


--
-- Name: workouts workouts_program_id_programs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_program_id_programs_id_fk FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;


--
-- Name: workouts workouts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Fb3H4PmSvATJTCx14aCmuQrZR08eSLRUIt4kKVvG17clR3y5XYjwEnIThgkxt8N

