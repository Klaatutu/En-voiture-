# 🚂 En voiture !

Jeu web **multijoueur coopératif** de conduite de train. Des groupes de joueurs
(lobbies) font avancer collectivement un train le plus loin possible. Chaque
partie est une session finie qui se termine par un incident ; le score est la
distance parcourue. Les joueurs progressent ensuite dans une couche méta
persistante (monnaie + upgrades) réinjectable dans n'importe quelle partie.

## Stack

- **Frontend** : React + Vite, PWA (manifest + service worker, Web Push à venir)
- **Backend** : Supabase (Postgres, Realtime, Auth, Edge Functions, pg_cron)
- **Simulation** : **autoritative côté serveur** dans la fonction Postgres
  `sim_tick()`, planifiée par `pg_cron`. Le client ne simule jamais — il
  affiche l'état et envoie des actions (RPC). *Aucune duplication de logique.*
- **Temps réel** : Supabase Realtime (Postgres changes) scopé par session.

## Arborescence

```
frontend/            React + Vite + PWA
  src/config/        constantes d'affichage (ré-exportées de shared/)
  src/lib/           client Supabase, wrappers d'actions (RPC)
  src/hooks/         useTrainState, useTrackProfile
  src/features/      driver/ (vue conducteur Phase 1)
shared/              constantes + types partagés (source unique de vérité)
supabase/
  migrations/        schéma SQL (une migration par phase)
  functions/         Edge Functions (Web Push, lifecycle — phases ultérieures)
docs/                notes de design, paramètres par phase
```

## Démarrer (dev)

### Base de données

```bash
supabase start          # démarre Postgres + Realtime local
supabase db reset       # applique les migrations (schéma + seed track)
```

Sur un projet hébergé : `supabase link` puis `supabase db push`.

> Les migrations activent `pg_cron` et planifient `sim_tick()` toutes les
> 5 s. Le tick est **basé sur le temps réel écoulé**, donc robuste à une
> cadence irrégulière ou à une coupure serveur (reprise cohérente).

### Frontend

```bash
cd frontend
cp .env.example .env.local   # renseigner l'URL + anon key Supabase
npm install
npm run dev
```

## Paramètres de simulation

Tous les nombres réglables (vitesse max, taux de conso charbon, seuil de
retard critique, cadence de tick…) sont :
- documentés dans `shared/constants.ts` (référence canonique + unités),
- appliqués au runtime depuis la table `sim_config` (une seule ligne) —
  **tuning en un seul endroit**.

## Décisions de design (Phase 1)

- Moteur de simulation : fonction Postgres + `pg_cron` (serveur autoritaire).
- Retard critique : dégrade seulement le score, **ne déclenche pas** de game
  over. Le game over reste réservé aux incidents durs.

Voir `docs/` pour le détail par phase.
