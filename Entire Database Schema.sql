--
-- PostgreSQL database dump
--

-- Dumped from database version 15.10
-- Dumped by pg_dump version 16.2

-- Started on 2025-04-16 05:19:05

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
-- TOC entry 7 (class 2615 OID 146159)
-- Name: google_vacuum_mgmt; Type: SCHEMA; Schema: -; Owner: cloudsqladmin
--

CREATE SCHEMA google_vacuum_mgmt;


ALTER SCHEMA google_vacuum_mgmt OWNER TO cloudsqladmin;

--
-- TOC entry 6 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: cloudsqlsuperuser
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO cloudsqlsuperuser;

--
-- TOC entry 2 (class 3079 OID 146160)
-- Name: google_vacuum_mgmt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS google_vacuum_mgmt WITH SCHEMA google_vacuum_mgmt;


--
-- TOC entry 4520 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION google_vacuum_mgmt; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION google_vacuum_mgmt IS 'extension for assistive operational tooling';


--
-- TOC entry 387 (class 1255 OID 167380)
-- Name: get_task_time_allocation_summary(integer); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.get_task_time_allocation_summary(p_task_id integer) RETURNS TABLE(task_id integer, task_name text, time_estimate_hours numeric, time_spent_hours numeric, remaining_hours numeric, employee_id integer, employee_name text, allocated_hours numeric, is_manual boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id AS task_id,
        t.clickup_task_id AS task_name,
        (t.time_estimate_seconds / 3600.0)::NUMERIC(10,2) AS time_estimate_hours,
        (COALESCE(tl.time_spent, 0) / 3600.0)::NUMERIC(10,2) AS time_spent_hours,
        ((t.time_estimate_seconds - COALESCE(tl.time_spent, 0)) / 3600.0)::NUMERIC(10,2) AS remaining_hours,
        p.employee_id,
        p.first_name || ' ' || p.last_name AS employee_name,
        (tta.allocated_time / 3600.0)::NUMERIC(10,2) AS allocated_hours,
        tta.is_manual
    FROM 
        public.tasks t
    JOIN 
        public.task_assignments ta ON t.id = ta.task_id
    JOIN 
        public.people p ON ta.employee_id = p.employee_id
    LEFT JOIN 
        public.task_time_allocation tta ON t.id = tta.task_id AND p.employee_id = tta.employee_id
    LEFT JOIN (
        SELECT 
            task_id, 
            SUM(EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER) AS time_spent
        FROM 
            public.time_logs
        WHERE 
            end_time IS NOT NULL
        GROUP BY 
            task_id
    ) tl ON t.id = tl.task_id
    WHERE 
        t.id = p_task_id
    ORDER BY 
        p.employee_id;
END;
$$;


ALTER FUNCTION public.get_task_time_allocation_summary(p_task_id integer) OWNER TO clickup;

--
-- TOC entry 357 (class 1255 OID 148624)
-- Name: log_project_name_change(); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.log_project_name_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        INSERT INTO public.project_name_history (project_id, old_name, changed_at)
        VALUES (OLD.id, OLD.name, now());
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_project_name_change() OWNER TO clickup;

--
-- TOC entry 359 (class 1255 OID 152069)
-- Name: log_task_completion(); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.log_task_completion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If status is changing to 1 (complete) and it wasn't 1 before
    IF NEW.status_id = 1 AND (OLD.status_id IS NULL OR OLD.status_id != 1) THEN
        -- Set closed_at to current timestamp
        NEW.closed_at = now();
    -- If status is changing from 1 to something else
    ELSIF OLD.status_id = 1 AND NEW.status_id != 1 THEN
        -- Clear the closed_at timestamp
        NEW.closed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_task_completion() OWNER TO clickup;

--
-- TOC entry 386 (class 1255 OID 167379)
-- Name: refresh_time_allocations(integer); Type: PROCEDURE; Schema: public; Owner: clickup
--

CREATE PROCEDURE public.refresh_time_allocations(IN p_user_id integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM public.update_task_time_allocation(p_user_id);
END;
$$;


ALTER PROCEDURE public.refresh_time_allocations(IN p_user_id integer) OWNER TO clickup;

--
-- TOC entry 385 (class 1255 OID 167378)
-- Name: set_manual_time_allocation(integer, jsonb, integer); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.set_manual_time_allocation(p_task_id integer, p_employee_allocations jsonb, p_user_id integer) RETURNS TABLE(success boolean, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_remaining_time INTEGER;
    v_total_allocated INTEGER := 0;
    v_employee_count INTEGER;
    v_employee_exists BOOLEAN;
    v_hours_in_seconds INTEGER;
    v_employee JSONB;
    v_employee_id INTEGER;
    v_assigned_employees INTEGER[];
    v_employee_names TEXT[];
    v_employee_ids INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
    -- Calculate remaining time on task
    SELECT 
        COALESCE(t.time_estimate_seconds, 0) - COALESCE(SUM(EXTRACT(EPOCH FROM (tl.end_time - tl.start_time))::INTEGER), 0)
    INTO v_remaining_time
    FROM 
        public.tasks t
    LEFT JOIN 
        public.time_logs tl ON t.id = tl.task_id AND tl.end_time IS NOT NULL
    WHERE 
        t.id = p_task_id
    GROUP BY 
        t.id, t.time_estimate_seconds;
    
    -- Get assigned employees for this task
    SELECT 
        ARRAY_AGG(employee_id),
        ARRAY_AGG(p.first_name || ' ' || p.last_name)
    INTO 
        v_assigned_employees,
        v_employee_names
    FROM 
        public.task_assignments ta
    JOIN
        public.people p ON ta.employee_id = p.employee_id
    WHERE 
        ta.task_id = p_task_id;
        
    -- Count how many employees are assigned to the task
    v_employee_count := array_length(v_assigned_employees, 1);
    
    -- If no employees assigned, return error
    IF v_employee_count IS NULL OR v_employee_count = 0 THEN
        RETURN QUERY SELECT FALSE, 'No employees assigned to this task';
        RETURN;
    END IF;
    
    -- Validate all employees in the input JSON are assigned to the task
    -- Also calculate total allocated time
    -- Also build array of employee IDs for later use
    FOR i IN 0..jsonb_array_length(p_employee_allocations)-1 LOOP
        v_employee := p_employee_allocations->i;
        v_employee_id := (v_employee->>'employee_id')::INTEGER;
        
        -- Add to employee ID array
        v_employee_ids := array_append(v_employee_ids, v_employee_id);
        
        -- Check if employee is assigned to this task
        v_employee_exists := v_employee_id = ANY(v_assigned_employees);
        
        IF NOT v_employee_exists THEN
            RETURN QUERY SELECT FALSE, 'Employee ID ' || v_employee_id::TEXT || ' is not assigned to this task. Assigned employees: ' || 
                array_to_string(v_employee_names, ', ');
            RETURN;
        END IF;
        
        -- Validate hours are not negative
        IF (v_employee->>'hours')::NUMERIC < 0 THEN
            RETURN QUERY SELECT FALSE, 'Hours cannot be negative for employee ID ' || v_employee_id::TEXT;
            RETURN;
        END IF;
        
        -- Convert hours to seconds and add to total
        v_hours_in_seconds := (v_employee->>'hours')::NUMERIC * 3600;
        v_total_allocated := v_total_allocated + v_hours_in_seconds;
    END LOOP;
    
    -- Validate total allocation is within a small tolerance of the remaining time
    IF ABS(v_total_allocated - v_remaining_time) > 5 THEN
        RETURN QUERY SELECT FALSE, 'Total allocated time (' || (v_total_allocated/3600.0)::TEXT || 
            ' hours) does not match remaining time on task (' || (v_remaining_time/3600.0)::TEXT || ' hours)';
        RETURN;
    END IF;
    
    -- Delete only the allocations for employees specified in the input JSON
    DELETE FROM public.task_time_allocation
    WHERE task_id = p_task_id AND employee_id = ANY(v_employee_ids);
    
    -- Insert new manual allocations
    FOR i IN 0..jsonb_array_length(p_employee_allocations)-1 LOOP
        v_employee := p_employee_allocations->i;
        v_employee_id := (v_employee->>'employee_id')::INTEGER;
        v_hours_in_seconds := (v_employee->>'hours')::NUMERIC * 3600;
        
        INSERT INTO public.task_time_allocation(
            task_id, 
            employee_id, 
            allocated_time, 
            is_manual, 
            calculated_at, 
            created_by_user_id, 
            modified_by_user_id
        ) VALUES (
            p_task_id,
            v_employee_id,
            v_hours_in_seconds,
            TRUE,
            now(),
            p_user_id,
            p_user_id
        );
    END LOOP;
    
    -- Return success
    RETURN QUERY SELECT TRUE, 'Manual time allocation completed successfully';
END;
$$;


ALTER FUNCTION public.set_manual_time_allocation(p_task_id integer, p_employee_allocations jsonb, p_user_id integer) OWNER TO clickup;

--
-- TOC entry 388 (class 1255 OID 167381)
-- Name: trigger_update_time_allocation(); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.trigger_update_time_allocation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    -- Try to get current user ID from context
    BEGIN
        SELECT p.employee_id INTO v_user_id
        FROM public.current_user_context cuc
        JOIN public.people p ON cuc.user_email = p.email
        ORDER BY cuc.created_at DESC
        LIMIT 1;
    EXCEPTION
        WHEN OTHERS THEN
            v_user_id := NULL;
    END;
    
    -- Call the function to update allocations
    PERFORM public.update_task_time_allocation(v_user_id);
    
    RETURN NULL;
END;
$$;


ALTER FUNCTION public.trigger_update_time_allocation() OWNER TO clickup;

--
-- TOC entry 360 (class 1255 OID 562041)
-- Name: update_estimates_timestamp(); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.update_estimates_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.modified_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_estimates_timestamp() OWNER TO clickup;

--
-- TOC entry 358 (class 1255 OID 148950)
-- Name: update_supplies_timestamp(); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.update_supplies_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.last_updated = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_supplies_timestamp() OWNER TO clickup;

--
-- TOC entry 384 (class 1255 OID 167377)
-- Name: update_task_time_allocation(integer); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.update_task_time_allocation(p_user_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Delete only automatic allocations, preserving manual adjustments
    DELETE FROM public.task_time_allocation 
    WHERE is_manual = FALSE
    AND task_id IN (
        SELECT t.id 
        FROM public.tasks t
        WHERE t.task_open = true 
        AND t.time_estimate_seconds IS NOT NULL
    );
    
    -- Get list of tasks that need allocation calculations
    WITH task_data AS (
        SELECT 
            t.id AS task_id,
            COALESCE(t.time_estimate_seconds, 0) - COALESCE(tl.time_spent_seconds, 0) AS remaining_time,
            COUNT(ta.employee_id) AS employee_count,
            COALESCE(SUM(CASE WHEN tta.is_manual THEN tta.allocated_time ELSE 0 END), 0) AS manual_allocated_time,
            ARRAY_AGG(ta.employee_id) AS employee_ids,
            -- Count how many employees already have manual allocations
            COUNT(CASE WHEN tta.is_manual THEN tta.employee_id END) AS manual_employee_count
        FROM 
            public.tasks t
        JOIN 
            public.task_assignments ta ON t.id = ta.task_id
        LEFT JOIN (
            -- Calculate total time spent on each task
            SELECT 
                task_id, 
                SUM(EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER) AS time_spent_seconds
            FROM 
                public.time_logs
            WHERE 
                end_time IS NOT NULL
            GROUP BY 
                task_id
        ) tl ON t.id = tl.task_id
        LEFT JOIN
            public.task_time_allocation tta ON t.id = tta.task_id AND ta.employee_id = tta.employee_id
        WHERE 
            t.task_open = true 
        AND 
            t.time_estimate_seconds IS NOT NULL
        GROUP BY 
            t.id, t.time_estimate_seconds, tl.time_spent_seconds
    )
    
    -- Insert new allocations
    INSERT INTO public.task_time_allocation 
        (task_id, employee_id, allocated_time, calculated_at, created_by_user_id, modified_by_user_id, is_manual)
    SELECT 
        ta.task_id,
        ta.employee_id,
        -- Calculate remaining time (after accounting for manual allocations) divided by number of remaining employees
        CASE 
            WHEN td.employee_count - td.manual_employee_count > 0 
            THEN FLOOR((td.remaining_time - td.manual_allocated_time) / 
                 (td.employee_count - td.manual_employee_count))::INTEGER
            ELSE 0
        END AS allocated_time,
        now() AS calculated_at,
        p_user_id AS created_by_user_id,
        p_user_id AS modified_by_user_id,
        FALSE AS is_manual
    FROM 
        public.task_assignments ta
    JOIN 
        task_data td ON ta.task_id = td.task_id
    LEFT JOIN
        public.task_time_allocation tta ON ta.task_id = tta.task_id AND ta.employee_id = tta.employee_id
    WHERE
        tta.id IS NULL OR tta.is_manual = FALSE;
        
    -- Handle edge case where allocated_time might be negative
    UPDATE public.task_time_allocation
    SET allocated_time = 0,
        modified_by_user_id = p_user_id,
        modified_at = now()
    WHERE allocated_time < 0 AND is_manual = FALSE;
END;
$$;


ALTER FUNCTION public.update_task_time_allocation(p_user_id integer) OWNER TO clickup;

--
-- TOC entry 383 (class 1255 OID 167376)
-- Name: validate_task_allocations(integer); Type: FUNCTION; Schema: public; Owner: clickup
--

CREATE FUNCTION public.validate_task_allocations(p_task_id integer) RETURNS TABLE(is_valid boolean, message text, expected_hours numeric, allocated_hours numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_remaining_seconds INTEGER;
    v_allocated_seconds INTEGER;
BEGIN
    -- Get remaining time
    SELECT 
        COALESCE(t.time_estimate_seconds, 0) - COALESCE(SUM(EXTRACT(EPOCH FROM (tl.end_time - tl.start_time))::INTEGER), 0)
    INTO v_remaining_seconds
    FROM 
        public.tasks t
    LEFT JOIN 
        public.time_logs tl ON t.id = tl.task_id AND tl.end_time IS NOT NULL
    WHERE 
        t.id = p_task_id
    GROUP BY 
        t.id, t.time_estimate_seconds;
    
    -- Get allocated time
    SELECT COALESCE(SUM(allocated_time), 0)
    INTO v_allocated_seconds
    FROM public.task_time_allocation
    WHERE task_id = p_task_id;
    
    -- Determine if allocation is valid with a small tolerance for rounding errors
    IF ABS(v_remaining_seconds - v_allocated_seconds) <= 5 THEN
        RETURN QUERY SELECT 
            TRUE, 
            'Task allocations are valid', 
            (v_remaining_seconds / 3600.0)::NUMERIC(10,2), 
            (v_allocated_seconds / 3600.0)::NUMERIC(10,2);
    ELSE
        RETURN QUERY SELECT 
            FALSE, 
            'Task allocations do not match remaining time', 
            (v_remaining_seconds / 3600.0)::NUMERIC(10,2), 
            (v_allocated_seconds / 3600.0)::NUMERIC(10,2);
    END IF;
END;
$$;


ALTER FUNCTION public.validate_task_allocations(p_task_id integer) OWNER TO clickup;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 270 (class 1259 OID 16467)
-- Name: Timelog; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public."Timelog" (
    "Task Name" text,
    "Task ID" text,
    "Team Member" text,
    "Start Time" timestamp without time zone,
    "End Time" timestamp without time zone,
    "Time Entry ID" text NOT NULL,
    time_spent bigint,
    id integer NOT NULL,
    parent_task_id character varying,
    list_id bigint
);


ALTER TABLE public."Timelog" OWNER TO clickup;

--
-- TOC entry 273 (class 1259 OID 145740)
-- Name: Timelog_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public."Timelog_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Timelog_id_seq" OWNER TO clickup;

--
-- TOC entry 4533 (class 0 OID 0)
-- Dependencies: 273
-- Name: Timelog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public."Timelog_id_seq" OWNED BY public."Timelog".id;


--
-- TOC entry 275 (class 1259 OID 145854)
-- Name: addresses; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.addresses (
    id integer NOT NULL,
    zip_code text,
    google_address_id text,
    google_map_link text,
    address text,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.addresses OWNER TO clickup;

--
-- TOC entry 276 (class 1259 OID 145857)
-- Name: address_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.address_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.address_id_seq OWNER TO clickup;

--
-- TOC entry 4534 (class 0 OID 0)
-- Dependencies: 276
-- Name: address_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.address_id_seq OWNED BY public.addresses.id;


--
-- TOC entry 338 (class 1259 OID 152201)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.audit_logs (
    log_id integer NOT NULL,
    table_name character varying(255) NOT NULL,
    record_id integer NOT NULL,
    operation character varying(20) NOT NULL,
    changed_fields jsonb,
    changed_by_user_id integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO clickup;

--
-- TOC entry 340 (class 1259 OID 152272)
-- Name: audit_logs_backup; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.audit_logs_backup (
    log_id integer,
    table_name character varying(255),
    record_id integer,
    operation character varying(20),
    changed_fields jsonb,
    changed_by_user_id integer,
    changed_at timestamp without time zone
);


ALTER TABLE public.audit_logs_backup OWNER TO clickup;

--
-- TOC entry 337 (class 1259 OID 152200)
-- Name: audit_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.audit_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_log_id_seq OWNER TO clickup;

--
-- TOC entry 4535 (class 0 OID 0)
-- Dependencies: 337
-- Name: audit_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.audit_logs_log_id_seq OWNED BY public.audit_logs.log_id;


--
-- TOC entry 322 (class 1259 OID 148874)
-- Name: bid_materials; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.bid_materials (
    id integer NOT NULL,
    job_id integer NOT NULL,
    supply_id integer NOT NULL,
    quantity numeric(10,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    custom_price numeric(12,2),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    supply_price_at_bid numeric(10,2)
);


ALTER TABLE public.bid_materials OWNER TO clickup;

--
-- TOC entry 321 (class 1259 OID 148873)
-- Name: bid_materials_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.bid_materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bid_materials_id_seq OWNER TO clickup;

--
-- TOC entry 4536 (class 0 OID 0)
-- Dependencies: 321
-- Name: bid_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.bid_materials_id_seq OWNED BY public.bid_materials.id;


--
-- TOC entry 332 (class 1259 OID 149085)
-- Name: bid_time_estimates; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.bid_time_estimates (
    id integer NOT NULL,
    job_id integer NOT NULL,
    template_hours numeric(10,2),
    mold_hours numeric(10,2),
    pour_hours numeric(10,2),
    demold_hours numeric(10,2),
    process_hours numeric(10,2),
    seal_hours numeric(10,2),
    install_hours numeric(10,2),
    cnc_hours numeric(10,2),
    cad_hours numeric(10,2),
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    misc_hours numeric(10,2),
    break_even_rate numeric(10,2),
    margin numeric(10,2)
);


ALTER TABLE public.bid_time_estimates OWNER TO clickup;

--
-- TOC entry 4537 (class 0 OID 0)
-- Dependencies: 332
-- Name: COLUMN bid_time_estimates.break_even_rate; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.bid_time_estimates.break_even_rate IS 'Break-even rate for the time estimate';


--
-- TOC entry 4538 (class 0 OID 0)
-- Dependencies: 332
-- Name: COLUMN bid_time_estimates.margin; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.bid_time_estimates.margin IS 'Margin for the time estimate';


--
-- TOC entry 331 (class 1259 OID 149084)
-- Name: bid_time_estimates_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.bid_time_estimates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bid_time_estimates_id_seq OWNER TO clickup;

--
-- TOC entry 4539 (class 0 OID 0)
-- Dependencies: 331
-- Name: bid_time_estimates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.bid_time_estimates_id_seq OWNED BY public.bid_time_estimates.id;


--
-- TOC entry 342 (class 1259 OID 152545)
-- Name: break_even_rates; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.break_even_rates (
    id integer NOT NULL,
    rate_month date NOT NULL,
    hourly_rate numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_by_user_id integer,
    CONSTRAINT rate_month_first_day CHECK ((rate_month = date_trunc('month'::text, (rate_month)::timestamp with time zone)))
);


ALTER TABLE public.break_even_rates OWNER TO clickup;

--
-- TOC entry 4540 (class 0 OID 0)
-- Dependencies: 342
-- Name: TABLE break_even_rates; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON TABLE public.break_even_rates IS 'Stores monthly break-even rates for financial calculations';


--
-- TOC entry 4541 (class 0 OID 0)
-- Dependencies: 342
-- Name: COLUMN break_even_rates.rate_month; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.break_even_rates.rate_month IS 'First day of the month for which this rate applies';


--
-- TOC entry 4542 (class 0 OID 0)
-- Dependencies: 342
-- Name: COLUMN break_even_rates.hourly_rate; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.break_even_rates.hourly_rate IS 'Break-even rate in dollars per hour';


--
-- TOC entry 341 (class 1259 OID 152544)
-- Name: break_even_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

ALTER TABLE public.break_even_rates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.break_even_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 303 (class 1259 OID 146041)
-- Name: color; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.color (
    id integer NOT NULL,
    concrete_color character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.color OWNER TO clickup;

--
-- TOC entry 302 (class 1259 OID 146040)
-- Name: color_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.color_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.color_id_seq OWNER TO clickup;

--
-- TOC entry 4543 (class 0 OID 0)
-- Dependencies: 302
-- Name: color_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.color_id_seq OWNED BY public.color.id;


--
-- TOC entry 339 (class 1259 OID 152217)
-- Name: current_user_context; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.current_user_context (
    session_id text NOT NULL,
    user_email text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.current_user_context OWNER TO clickup;

--
-- TOC entry 283 (class 1259 OID 145911)
-- Name: customer_type; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.customer_type (
    id integer NOT NULL,
    customer_type character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.customer_type OWNER TO clickup;

--
-- TOC entry 309 (class 1259 OID 146175)
-- Name: email_archive; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.email_archive (
    date timestamp without time zone,
    thread_id character varying,
    subject character varying,
    text_content text,
    sender character varying,
    recipient text,
    cc text,
    bcc text,
    in_reply_to character varying,
    uid bigint,
    project_id integer,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.email_archive OWNER TO clickup;

--
-- TOC entry 347 (class 1259 OID 166987)
-- Name: estimate_jobs; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.estimate_jobs (
    id integer NOT NULL,
    estimate_id integer NOT NULL,
    job_id integer NOT NULL
);


ALTER TABLE public.estimate_jobs OWNER TO clickup;

--
-- TOC entry 346 (class 1259 OID 166986)
-- Name: estimate_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.estimate_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estimate_jobs_id_seq OWNER TO clickup;

--
-- TOC entry 4544 (class 0 OID 0)
-- Dependencies: 346
-- Name: estimate_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.estimate_jobs_id_seq OWNED BY public.estimate_jobs.id;


--
-- TOC entry 345 (class 1259 OID 166972)
-- Name: estimates; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.estimates (
    id integer NOT NULL,
    project_id integer NOT NULL,
    estimate_number character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_by_user_id integer,
    created_by_user_id integer
);


ALTER TABLE public.estimates OWNER TO clickup;

--
-- TOC entry 344 (class 1259 OID 166971)
-- Name: estimates_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.estimates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estimates_id_seq OWNER TO clickup;

--
-- TOC entry 4545 (class 0 OID 0)
-- Dependencies: 344
-- Name: estimates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.estimates_id_seq OWNED BY public.estimates.id;


--
-- TOC entry 289 (class 1259 OID 145942)
-- Name: internal_people; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.internal_people (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    uuid uuid NOT NULL,
    dark_mode boolean NOT NULL,
    active boolean DEFAULT true,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.internal_people OWNER TO clickup;

--
-- TOC entry 318 (class 1259 OID 148641)
-- Name: jobs; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.jobs (
    id integer NOT NULL,
    project_id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    start_date date,
    due_date date,
    status_id integer,
    product_category_id integer,
    square_inches numeric(10,2),
    notes text,
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    retail_archived numeric(12,2),
    number_of_pieces integer,
    break_even numeric,
    contract_value bigint,
    material_cost bigint
);


ALTER TABLE public.jobs OWNER TO clickup;

--
-- TOC entry 4546 (class 0 OID 0)
-- Dependencies: 318
-- Name: COLUMN jobs.contract_value; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.jobs.contract_value IS 'Contract value in cents or smallest currency unit';


--
-- TOC entry 4547 (class 0 OID 0)
-- Dependencies: 318
-- Name: COLUMN jobs.material_cost; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.jobs.material_cost IS 'Material cost in cents or smallest currency unit';


--
-- TOC entry 317 (class 1259 OID 148640)
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.jobs_id_seq OWNER TO clickup;

--
-- TOC entry 4548 (class 0 OID 0)
-- Dependencies: 317
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- TOC entry 285 (class 1259 OID 145917)
-- Name: payment_status; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.payment_status (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_status OWNER TO clickup;

--
-- TOC entry 284 (class 1259 OID 145916)
-- Name: payment_status_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.payment_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_status_id_seq OWNER TO clickup;

--
-- TOC entry 4549 (class 0 OID 0)
-- Dependencies: 284
-- Name: payment_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.payment_status_id_seq OWNED BY public.payment_status.id;


--
-- TOC entry 288 (class 1259 OID 145929)
-- Name: people; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.people (
    employee_id integer NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    company_id integer,
    email character varying(255) NOT NULL,
    active boolean DEFAULT true,
    created_by_user_id integer,
    modified_by_user_id integer,
    team character varying(50)
);


ALTER TABLE public.people OWNER TO clickup;

--
-- TOC entry 287 (class 1259 OID 145928)
-- Name: people_employee_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.people_employee_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.people_employee_id_seq OWNER TO clickup;

--
-- TOC entry 4550 (class 0 OID 0)
-- Dependencies: 287
-- Name: people_employee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.people_employee_id_seq OWNED BY public.people.employee_id;


--
-- TOC entry 306 (class 1259 OID 146079)
-- Name: priority; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.priority (
    id integer NOT NULL,
    priority_name character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.priority OWNER TO clickup;

--
-- TOC entry 305 (class 1259 OID 146078)
-- Name: priority_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.priority_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.priority_id_seq OWNER TO clickup;

--
-- TOC entry 4551 (class 0 OID 0)
-- Dependencies: 305
-- Name: priority_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.priority_id_seq OWNED BY public.priority.id;


--
-- TOC entry 296 (class 1259 OID 145983)
-- Name: product_category; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.product_category (
    id integer NOT NULL,
    product_category_name character varying(255) NOT NULL,
    archived boolean NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.product_category OWNER TO clickup;

--
-- TOC entry 295 (class 1259 OID 145982)
-- Name: product_category_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.product_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_category_id_seq OWNER TO clickup;

--
-- TOC entry 4552 (class 0 OID 0)
-- Dependencies: 295
-- Name: product_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.product_category_id_seq OWNED BY public.product_category.id;


--
-- TOC entry 324 (class 1259 OID 148894)
-- Name: product_category_supplies; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.product_category_supplies (
    id integer NOT NULL,
    product_category_id integer NOT NULL,
    supply_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.product_category_supplies OWNER TO clickup;

--
-- TOC entry 323 (class 1259 OID 148893)
-- Name: product_category_supplies_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.product_category_supplies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_category_supplies_id_seq OWNER TO clickup;

--
-- TOC entry 4553 (class 0 OID 0)
-- Dependencies: 323
-- Name: product_category_supplies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.product_category_supplies_id_seq OWNED BY public.product_category_supplies.id;


--
-- TOC entry 314 (class 1259 OID 147782)
-- Name: project_assignments; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.project_assignments (
    id integer NOT NULL,
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    assigned_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.project_assignments OWNER TO clickup;

--
-- TOC entry 313 (class 1259 OID 147781)
-- Name: project_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.project_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_assignments_id_seq OWNER TO clickup;

--
-- TOC entry 4554 (class 0 OID 0)
-- Dependencies: 313
-- Name: project_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.project_assignments_id_seq OWNED BY public.project_assignments.id;


--
-- TOC entry 301 (class 1259 OID 146014)
-- Name: project_categories; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.project_categories (
    id integer NOT NULL,
    task_categories character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.project_categories OWNER TO clickup;

--
-- TOC entry 300 (class 1259 OID 146013)
-- Name: project_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.project_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_categories_id_seq OWNER TO clickup;

--
-- TOC entry 4555 (class 0 OID 0)
-- Dependencies: 300
-- Name: project_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.project_categories_id_seq OWNED BY public.project_categories.id;


--
-- TOC entry 298 (class 1259 OID 145990)
-- Name: project_classification; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.project_classification (
    id integer NOT NULL,
    project_classification_name character varying(255) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.project_classification OWNER TO clickup;

--
-- TOC entry 297 (class 1259 OID 145989)
-- Name: project_classification_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.project_classification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_classification_id_seq OWNER TO clickup;

--
-- TOC entry 4556 (class 0 OID 0)
-- Dependencies: 297
-- Name: project_classification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.project_classification_id_seq OWNED BY public.project_classification.id;


--
-- TOC entry 286 (class 1259 OID 145923)
-- Name: project_employee; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.project_employee (
    project_id integer NOT NULL,
    employee_id integer NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.project_employee OWNER TO clickup;

--
-- TOC entry 316 (class 1259 OID 148614)
-- Name: project_name_history; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.project_name_history (
    id integer NOT NULL,
    project_id integer NOT NULL,
    old_name text NOT NULL,
    changed_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.project_name_history OWNER TO clickup;

--
-- TOC entry 315 (class 1259 OID 148613)
-- Name: project_name_history_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.project_name_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_name_history_id_seq OWNER TO clickup;

--
-- TOC entry 4557 (class 0 OID 0)
-- Dependencies: 315
-- Name: project_name_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.project_name_history_id_seq OWNED BY public.project_name_history.id;


--
-- TOC entry 282 (class 1259 OID 145903)
-- Name: projects; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name text,
    hours integer,
    contract_id integer,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'America/Denver'::text),
    start_date date,
    company_id integer,
    updated_at timestamp without time zone,
    closed_at timestamp without time zone,
    archived boolean,
    due_date date,
    time_estimate_seconds integer,
    project_category_id integer,
    contract_value bigint,
    material_cost bigint,
    customer_name_id integer,
    product_category_id integer,
    status_id integer DEFAULT 2,
    concrete_color_id integer,
    address_id integer,
    work_category integer,
    project_open boolean DEFAULT true NOT NULL,
    clickup_task_id text,
    notes text,
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.projects OWNER TO clickup;

--
-- TOC entry 281 (class 1259 OID 145902)
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO clickup;

--
-- TOC entry 4558 (class 0 OID 0)
-- Dependencies: 281
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- TOC entry 330 (class 1259 OID 148992)
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    vendor_id integer,
    po_number text NOT NULL,
    order_date date DEFAULT CURRENT_DATE,
    expected_delivery date,
    status text NOT NULL,
    total_amount numeric(12,2),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer
);


ALTER TABLE public.purchase_orders OWNER TO clickup;

--
-- TOC entry 329 (class 1259 OID 148991)
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.purchase_orders_id_seq OWNER TO clickup;

--
-- TOC entry 4559 (class 0 OID 0)
-- Dependencies: 329
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- TOC entry 274 (class 1259 OID 145820)
-- Name: quickbooks_customers; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.quickbooks_customers (
    first_name text,
    last_name text,
    company_name text,
    quickbooks_id integer,
    email text,
    phone text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    display_name text,
    created_by_user_id integer,
    modified_by_user_id integer,
    id integer NOT NULL,
    customer_type_id integer
);


ALTER TABLE public.quickbooks_customers OWNER TO clickup;

--
-- TOC entry 343 (class 1259 OID 166858)
-- Name: quickbooks_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.quickbooks_customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quickbooks_customers_id_seq OWNER TO clickup;

--
-- TOC entry 4560 (class 0 OID 0)
-- Dependencies: 343
-- Name: quickbooks_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.quickbooks_customers_id_seq OWNED BY public.quickbooks_customers.id;


--
-- TOC entry 290 (class 1259 OID 145948)
-- Name: status; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.status (
    id integer NOT NULL,
    status_name character varying(50) NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.status OWNER TO clickup;

--
-- TOC entry 320 (class 1259 OID 148863)
-- Name: supplies; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.supplies (
    id integer NOT NULL,
    name text NOT NULL,
    internal_sku text,
    price numeric(12,2),
    last_updated timestamp without time zone DEFAULT now() NOT NULL,
    is_raw_material boolean DEFAULT true NOT NULL,
    has_variable_price boolean DEFAULT false,
    creator_id integer NOT NULL,
    unit_of_measure text,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.supplies OWNER TO clickup;

--
-- TOC entry 4561 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN supplies.last_updated; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.supplies.last_updated IS 'Automatically updated timestamp when the record is modified';


--
-- TOC entry 4562 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN supplies.creator_id; Type: COMMENT; Schema: public; Owner: clickup
--

COMMENT ON COLUMN public.supplies.creator_id IS 'References the employee_id in people table - tracks who added the supply. Initial supplies set to employee_id 1';


--
-- TOC entry 319 (class 1259 OID 148862)
-- Name: supplies_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.supplies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.supplies_id_seq OWNER TO clickup;

--
-- TOC entry 4563 (class 0 OID 0)
-- Dependencies: 319
-- Name: supplies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.supplies_id_seq OWNED BY public.supplies.id;


--
-- TOC entry 334 (class 1259 OID 152022)
-- Name: tags; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tags OWNER TO clickup;

--
-- TOC entry 333 (class 1259 OID 152021)
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tags_id_seq OWNER TO clickup;

--
-- TOC entry 4564 (class 0 OID 0)
-- Dependencies: 333
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- TOC entry 304 (class 1259 OID 146062)
-- Name: task_assignments; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.task_assignments (
    task_id integer NOT NULL,
    employee_id integer NOT NULL,
    created_by_user_id integer,
    modified_by_user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.task_assignments OWNER TO clickup;

--
-- TOC entry 271 (class 1259 OID 145710)
-- Name: task_list_raw; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.task_list_raw (
    "Task Name" character varying,
    "Task ID" character varying NOT NULL,
    "Parent Task ID" character varying,
    "Date Created" timestamp with time zone,
    "Date Updated" timestamp with time zone,
    "Date Closed" timestamp with time zone,
    "Archived" boolean,
    "Start Date" timestamp with time zone,
    "Due Date" timestamp with time zone,
    "Time Estimate" integer,
    "Time Spent" bigint,
    "List" character varying,
    "Color" character varying,
    "Contract Value" numeric,
    "Cost" numeric,
    "Project Categories" character varying,
    "Assignees" character varying,
    "Status" character varying,
    "Status Type" character varying,
    "Linked Tasks" character varying,
    "Priority" character varying,
    "Tags" character varying,
    id integer NOT NULL
);


ALTER TABLE public.task_list_raw OWNER TO clickup;

--
-- TOC entry 272 (class 1259 OID 145732)
-- Name: task_list_raw_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.task_list_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_list_raw_id_seq OWNER TO clickup;

--
-- TOC entry 4565 (class 0 OID 0)
-- Dependencies: 272
-- Name: task_list_raw_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.task_list_raw_id_seq OWNED BY public.task_list_raw.id;


--
-- TOC entry 336 (class 1259 OID 152035)
-- Name: task_tags; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.task_tags (
    id integer NOT NULL,
    task_id integer NOT NULL,
    tag_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.task_tags OWNER TO clickup;

--
-- TOC entry 335 (class 1259 OID 152034)
-- Name: task_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.task_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_tags_id_seq OWNER TO clickup;

--
-- TOC entry 4566 (class 0 OID 0)
-- Dependencies: 335
-- Name: task_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.task_tags_id_seq OWNED BY public.task_tags.id;


--
-- TOC entry 349 (class 1259 OID 167343)
-- Name: task_time_allocation; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.task_time_allocation (
    id integer NOT NULL,
    task_id integer NOT NULL,
    employee_id integer NOT NULL,
    allocated_time integer,
    is_manual boolean DEFAULT false,
    calculated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.task_time_allocation OWNER TO clickup;

--
-- TOC entry 348 (class 1259 OID 167342)
-- Name: task_time_allocation_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.task_time_allocation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_time_allocation_id_seq OWNER TO clickup;

--
-- TOC entry 4567 (class 0 OID 0)
-- Dependencies: 348
-- Name: task_time_allocation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.task_time_allocation_id_seq OWNED BY public.task_time_allocation.id;


--
-- TOC entry 278 (class 1259 OID 145884)
-- Name: task_type; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.task_type (
    id integer NOT NULL,
    task_type_name text
);


ALTER TABLE public.task_type OWNER TO clickup;

--
-- TOC entry 277 (class 1259 OID 145883)
-- Name: task_type_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.task_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_type_id_seq OWNER TO clickup;

--
-- TOC entry 4568 (class 0 OID 0)
-- Dependencies: 277
-- Name: task_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.task_type_id_seq OWNED BY public.task_type.id;


--
-- TOC entry 280 (class 1259 OID 145893)
-- Name: tasks; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    hours integer,
    created_at timestamp without time zone,
    start_date date,
    updated_at timestamp without time zone,
    closed_at timestamp without time zone,
    archived boolean,
    due_date date,
    time_estimate_seconds integer,
    project_id integer,
    task_type_id integer,
    payment_status_id integer,
    status_id integer,
    priority_id integer,
    task_open boolean DEFAULT true NOT NULL,
    notes text,
    assignee integer,
    clickup_task_id text,
    job_id integer,
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tasks OWNER TO clickup;

--
-- TOC entry 279 (class 1259 OID 145892)
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tasks_id_seq OWNER TO clickup;

--
-- TOC entry 4569 (class 0 OID 0)
-- Dependencies: 279
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- TOC entry 312 (class 1259 OID 146795)
-- Name: time_logs; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.time_logs (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    task_id integer NOT NULL,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'America/Denver'::text),
    archived boolean,
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.time_logs OWNER TO clickup;

--
-- TOC entry 311 (class 1259 OID 146794)
-- Name: time_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.time_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.time_logs_id_seq OWNER TO clickup;

--
-- TOC entry 4570 (class 0 OID 0)
-- Dependencies: 311
-- Name: time_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.time_logs_id_seq OWNED BY public.time_logs.id;


--
-- TOC entry 299 (class 1259 OID 146003)
-- Name: timer_sessions; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.timer_sessions (
    id integer NOT NULL,
    developer_email character varying(255) NOT NULL,
    running_timer_id integer,
    started_at timestamp without time zone,
    initial_seconds integer,
    task_id integer NOT NULL
);


ALTER TABLE public.timer_sessions OWNER TO clickup;

--
-- TOC entry 308 (class 1259 OID 146093)
-- Name: timers; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.timers (
    id integer NOT NULL,
    developer_email character varying(255) NOT NULL,
    task_id integer NOT NULL,
    seconds interval,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    date date,
    notes text,
    task_name text,
    start_time timestamp without time zone,
    end_time timestamp without time zone
);


ALTER TABLE public.timers OWNER TO clickup;

--
-- TOC entry 307 (class 1259 OID 146092)
-- Name: timers_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.timers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.timers_id_seq OWNER TO clickup;

--
-- TOC entry 4571 (class 0 OID 0)
-- Dependencies: 307
-- Name: timers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.timers_id_seq OWNED BY public.timers.id;


--
-- TOC entry 310 (class 1259 OID 146778)
-- Name: user_timers; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.user_timers (
    email character varying(255) NOT NULL,
    task_id integer,
    start_time timestamp without time zone,
    is_running boolean DEFAULT false,
    time_log_id integer
);


ALTER TABLE public.user_timers OWNER TO clickup;

--
-- TOC entry 328 (class 1259 OID 148967)
-- Name: vendor_supplies; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.vendor_supplies (
    id integer NOT NULL,
    vendor_id integer,
    supply_id integer,
    vendor_sku text,
    unit_price numeric(12,2),
    minimum_order text,
    lead_time_days integer,
    is_preferred_vendor boolean DEFAULT false,
    last_purchase_date timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    modified_by_user_id integer,
    modified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vendor_supplies OWNER TO clickup;

--
-- TOC entry 327 (class 1259 OID 148966)
-- Name: vendor_supplies_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.vendor_supplies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_supplies_id_seq OWNER TO clickup;

--
-- TOC entry 4572 (class 0 OID 0)
-- Dependencies: 327
-- Name: vendor_supplies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.vendor_supplies_id_seq OWNED BY public.vendor_supplies.id;


--
-- TOC entry 326 (class 1259 OID 148955)
-- Name: vendors; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    address_id integer,
    payment_terms text,
    tax_id text,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vendors OWNER TO clickup;

--
-- TOC entry 325 (class 1259 OID 148954)
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO clickup;

--
-- TOC entry 4573 (class 0 OID 0)
-- Dependencies: 325
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- TOC entry 292 (class 1259 OID 145954)
-- Name: work_assignment; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.work_assignment (
    id integer NOT NULL,
    project_id integer NOT NULL,
    developer_email character varying(255) NOT NULL
);


ALTER TABLE public.work_assignment OWNER TO clickup;

--
-- TOC entry 291 (class 1259 OID 145953)
-- Name: work_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.work_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.work_assignment_id_seq OWNER TO clickup;

--
-- TOC entry 4574 (class 0 OID 0)
-- Dependencies: 291
-- Name: work_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.work_assignment_id_seq OWNED BY public.work_assignment.id;


--
-- TOC entry 294 (class 1259 OID 145976)
-- Name: work_category; Type: TABLE; Schema: public; Owner: clickup
--

CREATE TABLE public.work_category (
    id integer NOT NULL,
    work_category_name character varying(255) NOT NULL
);


ALTER TABLE public.work_category OWNER TO clickup;

--
-- TOC entry 293 (class 1259 OID 145975)
-- Name: work_category_id_seq; Type: SEQUENCE; Schema: public; Owner: clickup
--

CREATE SEQUENCE public.work_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.work_category_id_seq OWNER TO clickup;

--
-- TOC entry 4575 (class 0 OID 0)
-- Dependencies: 293
-- Name: work_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: clickup
--

ALTER SEQUENCE public.work_category_id_seq OWNED BY public.work_category.id;


--
-- TOC entry 4070 (class 2604 OID 16444)
-- Name: Timelog id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public."Timelog" ALTER COLUMN id SET DEFAULT nextval('public."Timelog_id_seq"'::regclass);


--
-- TOC entry 4075 (class 2604 OID 145858)
-- Name: addresses id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.addresses ALTER COLUMN id SET DEFAULT nextval('public.address_id_seq'::regclass);


--
-- TOC entry 4160 (class 2604 OID 152204)
-- Name: audit_logs log_id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN log_id SET DEFAULT nextval('public.audit_logs_log_id_seq'::regclass);


--
-- TOC entry 4128 (class 2604 OID 148877)
-- Name: bid_materials id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_materials ALTER COLUMN id SET DEFAULT nextval('public.bid_materials_id_seq'::regclass);


--
-- TOC entry 4150 (class 2604 OID 149088)
-- Name: bid_time_estimates id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_time_estimates ALTER COLUMN id SET DEFAULT nextval('public.bid_time_estimates_id_seq'::regclass);


--
-- TOC entry 4102 (class 2604 OID 146044)
-- Name: color id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.color ALTER COLUMN id SET DEFAULT nextval('public.color_id_seq'::regclass);


--
-- TOC entry 4168 (class 2604 OID 166990)
-- Name: estimate_jobs id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimate_jobs ALTER COLUMN id SET DEFAULT nextval('public.estimate_jobs_id_seq'::regclass);


--
-- TOC entry 4165 (class 2604 OID 166975)
-- Name: estimates id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates ALTER COLUMN id SET DEFAULT nextval('public.estimates_id_seq'::regclass);


--
-- TOC entry 4118 (class 2604 OID 148644)
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- TOC entry 4085 (class 2604 OID 145920)
-- Name: payment_status id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.payment_status ALTER COLUMN id SET DEFAULT nextval('public.payment_status_id_seq'::regclass);


--
-- TOC entry 4088 (class 2604 OID 147040)
-- Name: people employee_id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.people ALTER COLUMN employee_id SET DEFAULT nextval('public.people_employee_id_seq'::regclass);


--
-- TOC entry 4105 (class 2604 OID 146082)
-- Name: priority id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.priority ALTER COLUMN id SET DEFAULT nextval('public.priority_id_seq'::regclass);


--
-- TOC entry 4095 (class 2604 OID 145986)
-- Name: product_category id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category ALTER COLUMN id SET DEFAULT nextval('public.product_category_id_seq'::regclass);


--
-- TOC entry 4133 (class 2604 OID 148897)
-- Name: product_category_supplies id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category_supplies ALTER COLUMN id SET DEFAULT nextval('public.product_category_supplies_id_seq'::regclass);


--
-- TOC entry 4112 (class 2604 OID 147785)
-- Name: project_assignments id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_assignments ALTER COLUMN id SET DEFAULT nextval('public.project_assignments_id_seq'::regclass);


--
-- TOC entry 4099 (class 2604 OID 146017)
-- Name: project_categories id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_categories ALTER COLUMN id SET DEFAULT nextval('public.project_categories_id_seq'::regclass);


--
-- TOC entry 4098 (class 2604 OID 145993)
-- Name: project_classification id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_classification ALTER COLUMN id SET DEFAULT nextval('public.project_classification_id_seq'::regclass);


--
-- TOC entry 4116 (class 2604 OID 148617)
-- Name: project_name_history id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_name_history ALTER COLUMN id SET DEFAULT nextval('public.project_name_history_id_seq'::regclass);


--
-- TOC entry 4080 (class 2604 OID 145906)
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- TOC entry 4146 (class 2604 OID 148995)
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- TOC entry 4074 (class 2604 OID 166859)
-- Name: quickbooks_customers id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.quickbooks_customers ALTER COLUMN id SET DEFAULT nextval('public.quickbooks_customers_id_seq'::regclass);


--
-- TOC entry 4122 (class 2604 OID 148866)
-- Name: supplies id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.supplies ALTER COLUMN id SET DEFAULT nextval('public.supplies_id_seq'::regclass);


--
-- TOC entry 4153 (class 2604 OID 152025)
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- TOC entry 4071 (class 2604 OID 16445)
-- Name: task_list_raw id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_list_raw ALTER COLUMN id SET DEFAULT nextval('public.task_list_raw_id_seq'::regclass);


--
-- TOC entry 4157 (class 2604 OID 152038)
-- Name: task_tags id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags ALTER COLUMN id SET DEFAULT nextval('public.task_tags_id_seq'::regclass);


--
-- TOC entry 4169 (class 2604 OID 167346)
-- Name: task_time_allocation id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation ALTER COLUMN id SET DEFAULT nextval('public.task_time_allocation_id_seq'::regclass);


--
-- TOC entry 4076 (class 2604 OID 145887)
-- Name: task_type id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_type ALTER COLUMN id SET DEFAULT nextval('public.task_type_id_seq'::regclass);


--
-- TOC entry 4077 (class 2604 OID 145896)
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- TOC entry 4109 (class 2604 OID 146798)
-- Name: time_logs id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs ALTER COLUMN id SET DEFAULT nextval('public.time_logs_id_seq'::regclass);


--
-- TOC entry 4106 (class 2604 OID 146096)
-- Name: timers id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.timers ALTER COLUMN id SET DEFAULT nextval('public.timers_id_seq'::regclass);


--
-- TOC entry 4141 (class 2604 OID 148970)
-- Name: vendor_supplies id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies ALTER COLUMN id SET DEFAULT nextval('public.vendor_supplies_id_seq'::regclass);


--
-- TOC entry 4137 (class 2604 OID 148958)
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- TOC entry 4093 (class 2604 OID 145957)
-- Name: work_assignment id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.work_assignment ALTER COLUMN id SET DEFAULT nextval('public.work_assignment_id_seq'::regclass);


--
-- TOC entry 4094 (class 2604 OID 145979)
-- Name: work_category id; Type: DEFAULT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.work_category ALTER COLUMN id SET DEFAULT nextval('public.work_category_id_seq'::regclass);


--
-- TOC entry 4188 (class 2606 OID 145865)
-- Name: addresses address_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT address_pkey PRIMARY KEY (id);


--
-- TOC entry 4279 (class 2606 OID 152209)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id);


--
-- TOC entry 4252 (class 2606 OID 148882)
-- Name: bid_materials bid_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_materials
    ADD CONSTRAINT bid_materials_pkey PRIMARY KEY (id);


--
-- TOC entry 4264 (class 2606 OID 149097)
-- Name: bid_time_estimates bid_time_estimates_job_id_unique; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_time_estimates
    ADD CONSTRAINT bid_time_estimates_job_id_unique UNIQUE (job_id);


--
-- TOC entry 4266 (class 2606 OID 149090)
-- Name: bid_time_estimates bid_time_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_time_estimates
    ADD CONSTRAINT bid_time_estimates_pkey PRIMARY KEY (id);


--
-- TOC entry 4283 (class 2606 OID 152554)
-- Name: break_even_rates break_even_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.break_even_rates
    ADD CONSTRAINT break_even_rates_pkey PRIMARY KEY (id);


--
-- TOC entry 4231 (class 2606 OID 146046)
-- Name: color color_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.color
    ADD CONSTRAINT color_pkey PRIMARY KEY (id);


--
-- TOC entry 4281 (class 2606 OID 152224)
-- Name: current_user_context current_user_context_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.current_user_context
    ADD CONSTRAINT current_user_context_pkey PRIMARY KEY (session_id);


--
-- TOC entry 4205 (class 2606 OID 145915)
-- Name: customer_type customer_type_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.customer_type
    ADD CONSTRAINT customer_type_pkey PRIMARY KEY (id);


--
-- TOC entry 4290 (class 2606 OID 166992)
-- Name: estimate_jobs estimate_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimate_jobs
    ADD CONSTRAINT estimate_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4286 (class 2606 OID 166980)
-- Name: estimates estimates_estimate_number_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_estimate_number_key UNIQUE (estimate_number);


--
-- TOC entry 4288 (class 2606 OID 166978)
-- Name: estimates estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_pkey PRIMARY KEY (id);


--
-- TOC entry 4215 (class 2606 OID 145946)
-- Name: internal_people internal_people_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.internal_people
    ADD CONSTRAINT internal_people_pkey PRIMARY KEY (id);


--
-- TOC entry 4248 (class 2606 OID 148650)
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4207 (class 2606 OID 145922)
-- Name: payment_status payment_status_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.payment_status
    ADD CONSTRAINT payment_status_pkey PRIMARY KEY (id);


--
-- TOC entry 4211 (class 2606 OID 145936)
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (employee_id);


--
-- TOC entry 4235 (class 2606 OID 146084)
-- Name: priority priority_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.priority
    ADD CONSTRAINT priority_pkey PRIMARY KEY (id);


--
-- TOC entry 4223 (class 2606 OID 145988)
-- Name: product_category product_category_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category
    ADD CONSTRAINT product_category_pkey PRIMARY KEY (id);


--
-- TOC entry 4254 (class 2606 OID 148901)
-- Name: product_category_supplies product_category_supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category_supplies
    ADD CONSTRAINT product_category_supplies_pkey PRIMARY KEY (id);


--
-- TOC entry 4243 (class 2606 OID 147788)
-- Name: project_assignments project_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 4229 (class 2606 OID 146019)
-- Name: project_categories project_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_categories
    ADD CONSTRAINT project_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4225 (class 2606 OID 145995)
-- Name: project_classification project_classification_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_classification
    ADD CONSTRAINT project_classification_pkey PRIMARY KEY (id);


--
-- TOC entry 4209 (class 2606 OID 145927)
-- Name: project_employee project_employee_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_employee
    ADD CONSTRAINT project_employee_pkey PRIMARY KEY (project_id, employee_id);


--
-- TOC entry 4246 (class 2606 OID 148622)
-- Name: project_name_history project_name_history_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_name_history
    ADD CONSTRAINT project_name_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4201 (class 2606 OID 147900)
-- Name: projects projects_clickup_task_id_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_clickup_task_id_key UNIQUE (clickup_task_id);


--
-- TOC entry 4203 (class 2606 OID 145910)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- TOC entry 4262 (class 2606 OID 149002)
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4184 (class 2606 OID 166861)
-- Name: quickbooks_customers quickbooks_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.quickbooks_customers
    ADD CONSTRAINT quickbooks_customers_pkey PRIMARY KEY (id);


--
-- TOC entry 4217 (class 2606 OID 145952)
-- Name: status status_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.status
    ADD CONSTRAINT status_pkey PRIMARY KEY (id);


--
-- TOC entry 4250 (class 2606 OID 148872)
-- Name: supplies supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_pkey PRIMARY KEY (id);


--
-- TOC entry 4269 (class 2606 OID 152033)
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- TOC entry 4271 (class 2606 OID 152031)
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- TOC entry 4233 (class 2606 OID 146066)
-- Name: task_assignments task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_pkey PRIMARY KEY (task_id, employee_id);


--
-- TOC entry 4180 (class 2606 OID 16447)
-- Name: task_list_raw task_list_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_list_raw
    ADD CONSTRAINT task_list_raw_pkey PRIMARY KEY ("Task ID");


--
-- TOC entry 4275 (class 2606 OID 152041)
-- Name: task_tags task_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_pkey PRIMARY KEY (id);


--
-- TOC entry 4277 (class 2606 OID 152043)
-- Name: task_tags task_tags_unique; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_unique UNIQUE (task_id, tag_id);


--
-- TOC entry 4294 (class 2606 OID 167351)
-- Name: task_time_allocation task_time_allocation_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_pkey PRIMARY KEY (id);


--
-- TOC entry 4296 (class 2606 OID 167353)
-- Name: task_time_allocation task_time_allocation_task_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_task_id_employee_id_key UNIQUE (task_id, employee_id);


--
-- TOC entry 4191 (class 2606 OID 145891)
-- Name: task_type task_type_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_type
    ADD CONSTRAINT task_type_pkey PRIMARY KEY (id);


--
-- TOC entry 4196 (class 2606 OID 147902)
-- Name: tasks tasks_clickup_task_id_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_clickup_task_id_key UNIQUE (clickup_task_id);


--
-- TOC entry 4198 (class 2606 OID 145898)
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- TOC entry 4176 (class 2606 OID 16448)
-- Name: Timelog time_entry_id_pk; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public."Timelog"
    ADD CONSTRAINT time_entry_id_pk PRIMARY KEY ("Time Entry ID");


--
-- TOC entry 4178 (class 2606 OID 16449)
-- Name: Timelog time_entry_id_unique; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public."Timelog"
    ADD CONSTRAINT time_entry_id_unique UNIQUE ("Time Entry ID");


--
-- TOC entry 4241 (class 2606 OID 146800)
-- Name: time_logs time_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4227 (class 2606 OID 146007)
-- Name: timer_sessions timer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.timer_sessions
    ADD CONSTRAINT timer_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4237 (class 2606 OID 146100)
-- Name: timers timers_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.timers
    ADD CONSTRAINT timers_pkey PRIMARY KEY (id);


--
-- TOC entry 4213 (class 2606 OID 146720)
-- Name: people unique_email; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT unique_email UNIQUE (email);


--
-- TOC entry 4182 (class 2606 OID 16450)
-- Name: task_list_raw unique_task-id; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_list_raw
    ADD CONSTRAINT "unique_task-id" UNIQUE ("Task ID");


--
-- TOC entry 4186 (class 2606 OID 166869)
-- Name: quickbooks_customers uq_quickbooks_id; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.quickbooks_customers
    ADD CONSTRAINT uq_quickbooks_id UNIQUE (quickbooks_id);


--
-- TOC entry 4239 (class 2606 OID 146783)
-- Name: user_timers user_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.user_timers
    ADD CONSTRAINT user_timers_pkey PRIMARY KEY (email);


--
-- TOC entry 4258 (class 2606 OID 148977)
-- Name: vendor_supplies vendor_supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_pkey PRIMARY KEY (id);


--
-- TOC entry 4260 (class 2606 OID 148979)
-- Name: vendor_supplies vendor_supplies_vendor_id_supply_id_key; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_vendor_id_supply_id_key UNIQUE (vendor_id, supply_id);


--
-- TOC entry 4256 (class 2606 OID 148965)
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- TOC entry 4219 (class 2606 OID 145959)
-- Name: work_assignment work_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.work_assignment
    ADD CONSTRAINT work_assignment_pkey PRIMARY KEY (id);


--
-- TOC entry 4221 (class 2606 OID 145981)
-- Name: work_category work_category_pkey; Type: CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.work_category
    ADD CONSTRAINT work_category_pkey PRIMARY KEY (id);


--
-- TOC entry 4174 (class 1259 OID 145760)
-- Name: fki_task_id_fk; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX fki_task_id_fk ON public."Timelog" USING btree ("Task ID");


--
-- TOC entry 4284 (class 1259 OID 152565)
-- Name: idx_break_even_rates_month; Type: INDEX; Schema: public; Owner: clickup
--

CREATE UNIQUE INDEX idx_break_even_rates_month ON public.break_even_rates USING btree (rate_month);


--
-- TOC entry 4244 (class 1259 OID 148623)
-- Name: idx_project_name_history_old_name; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_project_name_history_old_name ON public.project_name_history USING btree (old_name);


--
-- TOC entry 4199 (class 1259 OID 146836)
-- Name: idx_projects_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_projects_id ON public.projects USING btree (id);


--
-- TOC entry 4267 (class 1259 OID 152056)
-- Name: idx_tags_name; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_tags_name ON public.tags USING btree (name);


--
-- TOC entry 4272 (class 1259 OID 152055)
-- Name: idx_task_tags_tag_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_task_tags_tag_id ON public.task_tags USING btree (tag_id);


--
-- TOC entry 4273 (class 1259 OID 152054)
-- Name: idx_task_tags_task_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_task_tags_task_id ON public.task_tags USING btree (task_id);


--
-- TOC entry 4291 (class 1259 OID 167375)
-- Name: idx_task_time_allocation_employee_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_task_time_allocation_employee_id ON public.task_time_allocation USING btree (employee_id);


--
-- TOC entry 4292 (class 1259 OID 167374)
-- Name: idx_task_time_allocation_task_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_task_time_allocation_task_id ON public.task_time_allocation USING btree (task_id);


--
-- TOC entry 4189 (class 1259 OID 146835)
-- Name: idx_task_type_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_task_type_id ON public.task_type USING btree (id);


--
-- TOC entry 4192 (class 1259 OID 146832)
-- Name: idx_tasks_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_tasks_id ON public.tasks USING btree (id);


--
-- TOC entry 4193 (class 1259 OID 146834)
-- Name: idx_tasks_project_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);


--
-- TOC entry 4194 (class 1259 OID 146833)
-- Name: idx_tasks_task_type_id; Type: INDEX; Schema: public; Owner: clickup
--

CREATE INDEX idx_tasks_task_type_id ON public.tasks USING btree (task_type_id);


--
-- TOC entry 4366 (class 2620 OID 148625)
-- Name: projects project_name_change_trigger; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER project_name_change_trigger AFTER UPDATE OF name ON public.projects FOR EACH ROW EXECUTE FUNCTION public.log_project_name_change();


--
-- TOC entry 4367 (class 2620 OID 167382)
-- Name: task_assignments task_assignment_change; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER task_assignment_change AFTER INSERT OR DELETE OR UPDATE ON public.task_assignments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_update_time_allocation();


--
-- TOC entry 4364 (class 2620 OID 152070)
-- Name: tasks task_status_change_trigger; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER task_status_change_trigger BEFORE UPDATE OF status_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.log_task_completion();


--
-- TOC entry 4365 (class 2620 OID 167384)
-- Name: tasks tasks_estimate_change; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER tasks_estimate_change AFTER UPDATE OF time_estimate_seconds ON public.tasks FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_update_time_allocation();


--
-- TOC entry 4368 (class 2620 OID 167383)
-- Name: time_logs time_logs_change; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER time_logs_change AFTER INSERT OR DELETE OR UPDATE ON public.time_logs FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_update_time_allocation();


--
-- TOC entry 4370 (class 2620 OID 562042)
-- Name: estimates update_estimates_last_updated; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER update_estimates_last_updated BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.update_estimates_timestamp();


--
-- TOC entry 4369 (class 2620 OID 148951)
-- Name: supplies update_supplies_last_updated; Type: TRIGGER; Schema: public; Owner: clickup
--

CREATE TRIGGER update_supplies_last_updated BEFORE UPDATE ON public.supplies FOR EACH ROW EXECUTE FUNCTION public.update_supplies_timestamp();


--
-- TOC entry 4351 (class 2606 OID 152210)
-- Name: audit_logs audit_logs_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4334 (class 2606 OID 148883)
-- Name: bid_materials bid_materials_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_materials
    ADD CONSTRAINT bid_materials_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- TOC entry 4335 (class 2606 OID 148888)
-- Name: bid_materials bid_materials_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_materials
    ADD CONSTRAINT bid_materials_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id);


--
-- TOC entry 4344 (class 2606 OID 149091)
-- Name: bid_time_estimates bid_time_estimates_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.bid_time_estimates
    ADD CONSTRAINT bid_time_estimates_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- TOC entry 4352 (class 2606 OID 152555)
-- Name: break_even_rates break_even_rates_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.break_even_rates
    ADD CONSTRAINT break_even_rates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4353 (class 2606 OID 152560)
-- Name: break_even_rates break_even_rates_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.break_even_rates
    ADD CONSTRAINT break_even_rates_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4358 (class 2606 OID 562031)
-- Name: estimate_jobs estimate_jobs_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimate_jobs
    ADD CONSTRAINT estimate_jobs_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;


--
-- TOC entry 4359 (class 2606 OID 562036)
-- Name: estimate_jobs estimate_jobs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimate_jobs
    ADD CONSTRAINT estimate_jobs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE RESTRICT;


--
-- TOC entry 4354 (class 2606 OID 562016)
-- Name: estimates estimates_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4355 (class 2606 OID 562011)
-- Name: estimates estimates_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4356 (class 2606 OID 166981)
-- Name: estimates estimates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4357 (class 2606 OID 561994)
-- Name: estimates estimates_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.status(id);


--
-- TOC entry 4305 (class 2606 OID 146052)
-- Name: projects fk_address_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_address_id FOREIGN KEY (address_id) REFERENCES public.addresses(id) NOT VALID;


--
-- TOC entry 4299 (class 2606 OID 147511)
-- Name: tasks fk_assignee; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_assignee FOREIGN KEY (assignee) REFERENCES public.people(employee_id);


--
-- TOC entry 4306 (class 2606 OID 146047)
-- Name: projects fk_concrete_color_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_concrete_color_id FOREIGN KEY (concrete_color_id) REFERENCES public.color(id) NOT VALID;


--
-- TOC entry 4307 (class 2606 OID 166875)
-- Name: projects fk_customer_name_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_customer_name_id FOREIGN KEY (customer_name_id) REFERENCES public.quickbooks_customers(id) ON DELETE SET NULL;


--
-- TOC entry 4298 (class 2606 OID 167264)
-- Name: quickbooks_customers fk_customer_type; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.quickbooks_customers
    ADD CONSTRAINT fk_customer_type FOREIGN KEY (customer_type_id) REFERENCES public.customer_type(id) ON DELETE SET NULL;


--
-- TOC entry 4300 (class 2606 OID 148656)
-- Name: tasks fk_job; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_job FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- TOC entry 4301 (class 2606 OID 146085)
-- Name: tasks fk_priority_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_priority_id FOREIGN KEY (priority_id) REFERENCES public.priority(id) NOT VALID;


--
-- TOC entry 4308 (class 2606 OID 146030)
-- Name: projects fk_product_category_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_product_category_id FOREIGN KEY (product_category_id) REFERENCES public.product_category(id) NOT VALID;


--
-- TOC entry 4314 (class 2606 OID 145970)
-- Name: work_assignment fk_project; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.work_assignment
    ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- TOC entry 4320 (class 2606 OID 146509)
-- Name: email_archive fk_project; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.email_archive
    ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES public.projects(id) NOT VALID;


--
-- TOC entry 4329 (class 2606 OID 148651)
-- Name: jobs fk_project; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4309 (class 2606 OID 146020)
-- Name: projects fk_project_category_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_project_category_id FOREIGN KEY (project_category_id) REFERENCES public.project_categories(id) NOT VALID;


--
-- TOC entry 4310 (class 2606 OID 146035)
-- Name: projects fk_status_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_status_id FOREIGN KEY (status_id) REFERENCES public.status(id) NOT VALID;


--
-- TOC entry 4302 (class 2606 OID 146008)
-- Name: tasks fk_task_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_task_id FOREIGN KEY (task_type_id) REFERENCES public.task_type(id) NOT VALID;


--
-- TOC entry 4338 (class 2606 OID 149057)
-- Name: vendors fk_vendor_address; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT fk_vendor_address FOREIGN KEY (address_id) REFERENCES public.addresses(id);


--
-- TOC entry 4311 (class 2606 OID 146057)
-- Name: projects fk_work_category_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_work_category_id FOREIGN KEY (work_category) REFERENCES public.work_category(id) NOT VALID;


--
-- TOC entry 4319 (class 2606 OID 146102)
-- Name: timers fkf_task_id; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.timers
    ADD CONSTRAINT fkf_task_id FOREIGN KEY (task_id) REFERENCES public.tasks(id) NOT VALID;


--
-- TOC entry 4330 (class 2606 OID 148927)
-- Name: jobs jobs_product_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_product_category_id_fkey FOREIGN KEY (product_category_id) REFERENCES public.product_category(id);


--
-- TOC entry 4336 (class 2606 OID 148902)
-- Name: product_category_supplies product_category_supplies_product_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category_supplies
    ADD CONSTRAINT product_category_supplies_product_category_id_fkey FOREIGN KEY (product_category_id) REFERENCES public.product_category(id) ON DELETE CASCADE;


--
-- TOC entry 4337 (class 2606 OID 148907)
-- Name: product_category_supplies product_category_supplies_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.product_category_supplies
    ADD CONSTRAINT product_category_supplies_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id);


--
-- TOC entry 4327 (class 2606 OID 147818)
-- Name: project_assignments project_assignments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4328 (class 2606 OID 147794)
-- Name: project_assignments project_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.people(employee_id) ON DELETE CASCADE;


--
-- TOC entry 4343 (class 2606 OID 149003)
-- Name: purchase_orders purchase_orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- TOC entry 4312 (class 2606 OID 152091)
-- Name: status status_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.status
    ADD CONSTRAINT status_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4313 (class 2606 OID 152096)
-- Name: status status_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.status
    ADD CONSTRAINT status_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4331 (class 2606 OID 152103)
-- Name: supplies supplies_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4332 (class 2606 OID 148944)
-- Name: supplies supplies_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.people(employee_id) ON DELETE RESTRICT;


--
-- TOC entry 4333 (class 2606 OID 152108)
-- Name: supplies supplies_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4345 (class 2606 OID 152115)
-- Name: tags tags_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4346 (class 2606 OID 152120)
-- Name: tags tags_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4315 (class 2606 OID 152126)
-- Name: task_assignments task_assignments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4316 (class 2606 OID 146072)
-- Name: task_assignments task_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(employee_id) ON DELETE CASCADE;


--
-- TOC entry 4317 (class 2606 OID 152131)
-- Name: task_assignments task_assignments_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4318 (class 2606 OID 146067)
-- Name: task_assignments task_assignments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- TOC entry 4297 (class 2606 OID 16451)
-- Name: Timelog task_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public."Timelog"
    ADD CONSTRAINT task_id_fk FOREIGN KEY ("Task ID") REFERENCES public.task_list_raw("Task ID") NOT VALID;


--
-- TOC entry 4347 (class 2606 OID 152138)
-- Name: task_tags task_tags_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4348 (class 2606 OID 152143)
-- Name: task_tags task_tags_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4349 (class 2606 OID 152049)
-- Name: task_tags task_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- TOC entry 4350 (class 2606 OID 152044)
-- Name: task_tags task_tags_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- TOC entry 4360 (class 2606 OID 167364)
-- Name: task_time_allocation task_time_allocation_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4361 (class 2606 OID 167359)
-- Name: task_time_allocation task_time_allocation_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(employee_id) ON DELETE CASCADE;


--
-- TOC entry 4362 (class 2606 OID 167369)
-- Name: task_time_allocation task_time_allocation_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4363 (class 2606 OID 167354)
-- Name: task_time_allocation task_time_allocation_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.task_time_allocation
    ADD CONSTRAINT task_time_allocation_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- TOC entry 4303 (class 2606 OID 152149)
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4304 (class 2606 OID 152154)
-- Name: tasks tasks_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4323 (class 2606 OID 152160)
-- Name: time_logs time_logs_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4324 (class 2606 OID 146801)
-- Name: time_logs time_logs_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_email_fkey FOREIGN KEY (email) REFERENCES public.people(email);


--
-- TOC entry 4325 (class 2606 OID 152165)
-- Name: time_logs time_logs_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4326 (class 2606 OID 146806)
-- Name: time_logs time_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- TOC entry 4321 (class 2606 OID 146784)
-- Name: user_timers user_timers_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.user_timers
    ADD CONSTRAINT user_timers_email_fkey FOREIGN KEY (email) REFERENCES public.people(email);


--
-- TOC entry 4322 (class 2606 OID 146789)
-- Name: user_timers user_timers_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.user_timers
    ADD CONSTRAINT user_timers_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- TOC entry 4339 (class 2606 OID 152171)
-- Name: vendor_supplies vendor_supplies_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4340 (class 2606 OID 152176)
-- Name: vendor_supplies vendor_supplies_modified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_modified_by_user_id_fkey FOREIGN KEY (modified_by_user_id) REFERENCES public.people(employee_id);


--
-- TOC entry 4341 (class 2606 OID 148985)
-- Name: vendor_supplies vendor_supplies_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id);


--
-- TOC entry 4342 (class 2606 OID 148980)
-- Name: vendor_supplies vendor_supplies_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: clickup
--

ALTER TABLE ONLY public.vendor_supplies
    ADD CONSTRAINT vendor_supplies_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- TOC entry 4518 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA google_vacuum_mgmt; Type: ACL; Schema: -; Owner: cloudsqladmin
--

GRANT USAGE ON SCHEMA google_vacuum_mgmt TO cloudsqlsuperuser;


--
-- TOC entry 4519 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: cloudsqlsuperuser
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- TOC entry 4521 (class 0 OID 0)
-- Dependencies: 362
-- Name: FUNCTION pg_replication_origin_advance(text, pg_lsn); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_advance(text, pg_lsn) TO cloudsqlsuperuser;


--
-- TOC entry 4522 (class 0 OID 0)
-- Dependencies: 364
-- Name: FUNCTION pg_replication_origin_create(text); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_create(text) TO cloudsqlsuperuser;


--
-- TOC entry 4523 (class 0 OID 0)
-- Dependencies: 361
-- Name: FUNCTION pg_replication_origin_drop(text); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_drop(text) TO cloudsqlsuperuser;


--
-- TOC entry 4524 (class 0 OID 0)
-- Dependencies: 365
-- Name: FUNCTION pg_replication_origin_oid(text); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_oid(text) TO cloudsqlsuperuser;


--
-- TOC entry 4525 (class 0 OID 0)
-- Dependencies: 363
-- Name: FUNCTION pg_replication_origin_progress(text, boolean); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_progress(text, boolean) TO cloudsqlsuperuser;


--
-- TOC entry 4526 (class 0 OID 0)
-- Dependencies: 350
-- Name: FUNCTION pg_replication_origin_session_is_setup(); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_is_setup() TO cloudsqlsuperuser;


--
-- TOC entry 4527 (class 0 OID 0)
-- Dependencies: 351
-- Name: FUNCTION pg_replication_origin_session_progress(boolean); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_progress(boolean) TO cloudsqlsuperuser;


--
-- TOC entry 4528 (class 0 OID 0)
-- Dependencies: 352
-- Name: FUNCTION pg_replication_origin_session_reset(); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_reset() TO cloudsqlsuperuser;


--
-- TOC entry 4529 (class 0 OID 0)
-- Dependencies: 353
-- Name: FUNCTION pg_replication_origin_session_setup(text); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_setup(text) TO cloudsqlsuperuser;


--
-- TOC entry 4530 (class 0 OID 0)
-- Dependencies: 354
-- Name: FUNCTION pg_replication_origin_xact_reset(); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_reset() TO cloudsqlsuperuser;


--
-- TOC entry 4531 (class 0 OID 0)
-- Dependencies: 355
-- Name: FUNCTION pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone) TO cloudsqlsuperuser;


--
-- TOC entry 4532 (class 0 OID 0)
-- Dependencies: 356
-- Name: FUNCTION pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn); Type: ACL; Schema: pg_catalog; Owner: cloudsqladmin
--

GRANT ALL ON FUNCTION pg_catalog.pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn) TO cloudsqlsuperuser;


-- Completed on 2025-04-16 05:19:07

--
-- PostgreSQL database dump complete
--

