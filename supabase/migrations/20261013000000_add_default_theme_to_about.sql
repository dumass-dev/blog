-- Migration: Add default_theme column to about table for configurable site-wide theme
ALTER TABLE public.about ADD COLUMN IF NOT EXISTS default_theme text DEFAULT 'dark';
