# Phase 2 — Lobbies & cycle de partie

## Ce qui a été implémenté

### Base de données (`0003_phase2_lobbies_lifecycle.sql`)
- **Identité joueur** : `ensure_player(pseudo)` — upsert d'une ligne `players`
  liée à `auth.uid()`.
- **Lobbies multijoueur** : colonne `code` (code court partageable),
  `lobby_members` (roster). Fonctions `create_lobby(nom)` (renvoie id + code)
  et `join_lobby(code)`.
- **Participants de session** : `session_players` (base du partage de
  récompense en Phase 6).
- **`start_session(lobby)`** (remplace la version Phase 1) : une seule session
  active par lobby (idempotent), initialise le train, inscrit les membres.
- **Détection d'incident dans `sim_tick`** :
  - `deraillement_aiguillage` : franchir un point `aiguillage` au-dessus de
    `vitesse_cible · (1 + overspeed_margin_aiguillage)`.
  - `panne_charbon` : charbon à 0 **et** train arrêté (rattrapable tant qu'il
    roule → ajoute du charbon à temps pour survivre).
  - Le **retard ne termine jamais** la partie (décision tenue).
- **`end_session(session, cause)`** : fige le score (`distance_totale_km`),
  passe `statut = 'terminee'`, `cause_fin`, `terminee_le`. Idempotent.
- Nouveaux tunables `sim_config` : `overspeed_margin_aiguillage` (0.20),
  `stop_epsilon_kmh` (0.5). RLS + Realtime pour les nouvelles tables.

### Frontend
- **`PseudoGate`** : choix du pseudo (crée le joueur).
- **`LobbyScreen`** : créer un convoi (obtenir un code) ou rejoindre par code.
- **`useLobbyGame(lobbyId)`** : suit le lobby, le roster **en temps réel**, et
  la session la plus récente (relance, fin, arrivées de membres).
- **`LobbyHome`** : salle d'attente (code partageable, équipage, démarrer).
- **`GameOverScreen`** : score figé + cause de l'incident + **relance** dans le
  même lobby.
- **`App`** route selon le statut de session : attente → conduite → fin.

## Choix d'architecture
- **Une session active par lobby**, `start_session` idempotent → pas de double
  départ (cas limite « actions simultanées »).
- **`end_session` idempotent** et déclenché côté serveur dans le tick → source
  de vérité unique pour la fin de partie (cohérent même multi-clients).
- **Parallélisme des lobbies** garanti par le scoping `lobby_id` / `session_id`
  partout (Realtime, sim, RPC).
- Incidents choisis pour **récompenser la planification** (freiner avant un
  aiguillage, gérer le charbon) — cohérent avec la vision « Virtual Regatta ».

## Cas limites couverts
- Double démarrage de session → idempotent.
- Fin de partie multi-clients → `end_session` idempotent, statut diffusé via
  Realtime à tous.
- Relance immédiate depuis le même lobby.

## À valider avant Phase 3
1. **Marge de survitesse** (0.20) et seuils d'incident à équilibrer au playtest.
2. Rejoindre un lobby **en cours de partie** : le membre voit l'état en lecture ;
   le verrouillage conducteur (qui peut agir) est le sujet de la Phase 3.
3. Le pilotage est encore **ouvert à tous** — Phase 3 introduit le vote et le
   verrouillage au conducteur actif.

## Migration à appliquer
Exécuter `supabase/migrations/0003_phase2_lobbies_lifecycle.sql` dans le SQL
Editor (ou `supabase db push`). Le `pg_cron` appelle `select sim_tick();`, donc
la nouvelle logique d'incident est active dès le remplacement de la fonction.
