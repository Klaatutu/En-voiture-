# Phase 1 — Fondations & simulation du train

## Ce qui a été implémenté

### Base de données (`supabase/migrations/`)
- `0001_phase1_foundations.sql`
  - Tables minimales `players`, `lobbies` (intégrité FK).
  - `track_profile` — référentiel d'itinéraire **partagé** (non scopé partie).
  - `game_sessions`, `train_state` — **scopés à la partie**.
  - `sim_config` — une ligne miroir de `shared/constants.ts` : point de
    réglage unique lu au runtime par la simulation.
  - `sim_tick()` — **la** boucle de simulation autoritaire (voir plus bas).
  - `pg_cron` planifie `sim_tick()` toutes les 5 s.
  - RPC d'actions joueur : `action_set_throttle`, `action_set_brake`,
    `action_add_charbon`, `action_set_aiguillage`, `action_set_mode_veille`.
  - `start_session(lobby)` — crée session + train initialisé.
  - RLS permissive (modèle de confiance coopératif).
  - Publication Realtime de `train_state` et `game_sessions`.
- `0002_phase1_track_seed.sql` — tracé démo ~60 km (plaines, rampe 12‰,
  sommet + gare, descente −8‰, deux aiguillages).

### Frontend (`frontend/`)
- Scaffold React + Vite + PWA (manifest + SW prêt pour Web Push Phase 7).
- `useTrainState` — abonnement Realtime à l'état autoritaire (< 2 s).
- `useTrackProfile` — chargement unique du tracé partagé.
- `lib/actions.ts` — wrappers RPC (le client *demande*, ne simule pas).
- `DriverView` — train animé selon la vitesse réelle, jauges vitesse/charbon,
  manettes accélérateur/frein, action charbon, retard accumulé (marqué
  « critique » au-delà du seuil), mode veille, liste des prochaines étapes.

## Modèle de simulation (`sim_tick`)

Pour chaque session `en_cours`, avec `dt` = temps réel écoulé depuis le dernier
tick (borné par `tick_max_dt_s` pour absorber une coupure) :

```
accel = (charbon>0 ? throttle·ACCEL_MAX : 0)
        − brake·BRAKE_MAX
        − ROLLING_RESISTANCE
        − GRADIENT_DRAG · pente(position)         # +pente = montée, freine
vitesse'  = clamp(vitesse + accel·dt, 0, VITESSE_MAX)
distance += moyenne(vitesse, vitesse')·dt / 3600
charbon  −= (BASE + SPEED·vitesse' + GRADIENT·max(pente,0))·dt
retard   += max(0, vitesse_cible(position) − vitesse')·dt / 3600
```

Le tick est **basé sur le temps** (idempotent à `dt=0`), d'où la robustesse à
la cadence cron et aux reprises après coupure — un des cas limites du prompt.

## Choix d'architecture
- **Serveur autoritaire, zéro duplication** : la physique n'existe qu'en SQL.
  Le client lit l'état (Realtime) et envoie des actions (RPC).
- **Tuning centralisé** : `sim_config` (DB) + `shared/constants.ts` (doc).
- **Retard = mauvais score, jamais game over** (décision validée).
- **`pg_cron` plutôt qu'Edge Function** pour le tick : déterministe, pas de
  cold start, coût minimal ; les Edge Functions seront réservées au Web Push
  et au lifecycle plus lourd.

## Cas limites déjà couverts
- Reprise après coupure serveur : `dt` réel borné → pas de saut géant.
- Charbon épuisé : l'accélérateur ne produit plus de poussée (le train roule
  sur son inertie puis s'arrête). *Le game over correspondant sera câblé en
  Phase 2 (détection d'incident).*

## À valider avant Phase 2
1. La cadence `pg_cron` « 5 seconds » suppose pg_cron ≥ 1.5 (OK sur Supabase).
   À confirmer sur l'instance cible ; sinon repli à une planification minute
   avec `dt` réel (la simulation reste correcte, juste moins fluide).
2. Constantes de simulation (accélérations, conso charbon, seuil retard) :
   valeurs de départ à équilibrer par playtest.
3. Modèle de retard : actuellement basé sur l'écart à `vitesse_cible`. À
   confronter au design « retard rattrapable » quand le mode veille sera
   pleinement exploité (Phase 2/3).

## Points d'entrée Phase 2
- Détection de fin de partie (incident) → figer `train_state`, `statut =
  'terminee'`, `cause_fin`, calcul du score.
- UI lobby : créer/rejoindre, démarrer/relancer une session.
