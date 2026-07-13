/**
 * Shared domain types (client ↔ edge functions).
 * Mirrors the DB schema. Phase 1 subset; extended in later phases.
 */

export type SessionStatus = 'en_cours' | 'terminee';
export type LobbyStatus = 'en_cours' | 'termine';

export type TrackPointType =
  | 'ligne_droite'
  | 'aiguillage'
  | 'gare'
  | 'montee'
  | 'descente';

export interface TrackPoint {
  id: string;
  position_km: number;
  /** Gradient in ‰, positive = uphill. */
  pente: number;
  /** Target/recommended speed at this point (km/h). */
  vitesse_cible: number;
  type_point: TrackPointType;
  libelle: string;
}

export interface GameSession {
  id: string;
  lobby_id: string;
  distance_totale_km: number;
  statut: SessionStatus;
  cause_fin: string | null;
  demarree_le: string;
  terminee_le: string | null;
}

export interface TrainState {
  session_id: string;
  vitesse: number;
  distance_parcourue: number;
  niveau_charbon: number;
  /** Accelerator lever position, 0..1. */
  throttle: number;
  /** Brake lever position, 0..1. */
  brake: number;
  etat_aiguillage_courant: 'gauche' | 'droite' | 'neutre';
  conducteur_actif_id: string | null;
  retard_accumule_km: number;
  /** True when the lobby has chosen to deliberately slow down (mode veille). */
  mode_veille: boolean;
  timestamp_dernier_tick: string;
}

export interface Player {
  id: string;
  pseudo: string;
  monnaie_persistante: number;
}

export interface Lobby {
  id: string;
  nom: string;
  code: string;
  statut: LobbyStatus;
}

export interface LobbyMember {
  lobby_id: string;
  player_id: string;
  joined_at: string;
  /** Joined client-side from players for display. */
  pseudo?: string;
}
