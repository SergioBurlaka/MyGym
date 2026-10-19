--
-- PostgreSQL database dump
--

\restrict CkCmJs7jLXXDgLKjuJ4jDk2BcthDNEodZ4knQYfgfc6p1FbKf1emP7N3cE8bxgw

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
    target_sets smallint DEFAULT 3 NOT NULL
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_index smallint DEFAULT 0 NOT NULL,
    try_more_after_workouts smallint
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    training_days jsonb DEFAULT '[1, 3, 5]'::jsonb NOT NULL
);


--
-- Name: workout_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    weight_per_unit_kg numeric(6,2),
    weight_units smallint DEFAULT 2,
    order_index smallint DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    program_id uuid
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
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


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
-- Name: exercises_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exercises_user_idx ON public.exercises USING btree (user_id);


--
-- Name: program_exercises_program_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_exercises_program_idx ON public.program_exercises USING btree (program_id);


--
-- Name: programs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX programs_user_idx ON public.programs USING btree (user_id);


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
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (lower(email));


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
-- Name: exercises exercises_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: program_exercises program_exercises_exercise_id_exercises_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercises
    ADD CONSTRAINT program_exercises_exercise_id_exercises_id_fk FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


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
    ADD CONSTRAINT workout_exercises_exercise_id_exercises_id_fk FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


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

\unrestrict CkCmJs7jLXXDgLKjuJ4jDk2BcthDNEodZ4knQYfgfc6p1FbKf1emP7N3cE8bxgw

