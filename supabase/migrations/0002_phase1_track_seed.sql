-- =====================================================================
-- Phase 1 — Seed a demo track profile.
-- A simple ~60 km line with flats, a climb, a summit gare, a descent,
-- and a switch (aiguillage). Positions are cumulative km from the start.
-- The layout is shared by every session; only progress differs.
-- =====================================================================
insert into track_profile (position_km, pente, vitesse_cible, type_point, libelle) values
  (  0.0,   0.0, 100, 'gare',         'Gare de départ — Origine'),
  (  2.0,   0.0, 110, 'ligne_droite', 'Plaine'),
  ( 10.0,   5.0,  90, 'montee',       'Début de rampe (5‰)'),
  ( 15.0,  12.0,  70, 'montee',       'Rampe sévère (12‰)'),
  ( 20.0,   0.0,  60, 'aiguillage',   'Bifurcation de Val-Profond'),
  ( 22.0,   0.0,  80, 'gare',         'Gare du Sommet'),
  ( 25.0,  -8.0, 100, 'descente',     'Descente (-8‰)'),
  ( 32.0,  -4.0, 110, 'descente',     'Descente douce (-4‰)'),
  ( 38.0,   0.0, 110, 'ligne_droite', 'Plaine de Grandchamp'),
  ( 45.0,   0.0,  50, 'aiguillage',   'Aiguillage de Roquefort'),
  ( 47.0,   0.0,  70, 'gare',         'Gare de Roquefort'),
  ( 52.0,   6.0,  85, 'montee',       'Faux-plat montant (6‰)'),
  ( 60.0,   0.0, 100, 'ligne_droite', 'Longue ligne — km 60')
on conflict (position_km) do nothing;
