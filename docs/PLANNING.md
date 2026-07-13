# Planification — le cœur « Virtual Regatta »

## Idée
Le tracé (`track_profile`) est **connu à l'avance**. Le joueur pose des
**consignes** attachées à une position (« à km 8, accélérateur 100 % »). Au
lancement, le **serveur exécute le plan automatiquement** (un pilote automatique
paramétrable) : quand le train franchit la position d'une consigne, elle est
appliquée. Le but est d'**optimiser** le plan pour aller le plus loin possible
sans dérailler (survitesse à l'aiguillage) ni tomber en panne (charbon).

## Choix de design (v1)
- **Actions = réglages de manette** : `throttle`/`brake` (0..1) à une position,
  plus `charbon` (ajoute une pelletée). Direct, colle à la physique.
- **Édition à tout moment** : on peut ajouter/supprimer les consignes encore à
  venir (position ≥ position actuelle du train) avant ET pendant la course.
- **Physique factorisée** : une seule fonction SQL `sim_step` est utilisée par
  le tick live (et, à venir, l'aperçu prédictif) → **aucune duplication** de
  logique de simulation.

## Détail important — poser les actions *en amont*
Une consigne appliquée au km X n'agit que sur les ticks **suivants** (le tick où
elle est franchie a déjà calculé la vitesse avec l'ancien réglage). Donc pour
aborder un aiguillage à la bonne vitesse, il faut **freiner un peu avant**.
C'est volontaire et cohérent avec la conduite réelle (et avec l'esprit VR : on
anticipe). L'UI le rappelle.

## Backend (`0004_phase_planning.sql`)
- `planned_actions` (session, position_km, action_type, value, applied).
- `sim_step(...)` — pas de simulation autoritaire, pur, réutilisable.
- `sim_tick` réécrit : utilise `sim_step` puis applique les consignes franchies.
- RPC `add_planned_action`, `delete_planned_action`. RLS + Realtime.

## Frontend
- `ProfileChart` (SVG) : profil du tracé (vitesse cible en escalier, bande de
  dénivelé, aiguillages/gares, marqueurs de consignes, position live du train).
  Touche le profil → choisit un km dans le formulaire.
- `PlanningView` : chart + formulaire d'ajout + liste du plan (supprimable tant
  que non appliqué).
- Onglets **Conduite / Plan** dans une session active.

## Prochaine étape (validée pour juste après)
- **Aperçu prédictif** : un RPC `preview_plan(session)` qui simule le plan en
  avant avec `sim_step` (mêmes constantes) et renvoie la courbe vitesse/charbon
  projetée + le premier incident prévu — l'outil d'optimisation ultime, sans
  avoir à lancer la course.
