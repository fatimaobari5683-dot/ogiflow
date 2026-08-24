export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CIN: "CIN (carte d'identité)",
  DRIVER_LICENSE: 'Permis de conduire',
  VEHICLE_REGISTRATION: 'Carte grise',
  VEHICLE_INSURANCE: "Attestation d'assurance",
  COMPANY_REGISTRATION: "Registre de commerce / justificatif d'activité",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  UPLOADED: 'En attente de revue',
  UNDER_REVIEW: 'En cours de revue',
  VERIFIED: 'Vérifié',
  REJECTED: 'Refusé',
  EXPIRED: 'Expiré',
};

export const DOCUMENT_STATUS_CLASSES: Record<string, string> = {
  UPLOADED: 'bg-slate-100 text-ink-secondary',
  UNDER_REVIEW: 'bg-brand-50 text-brand-700',
  VERIFIED: 'bg-[#0ca30c]/10 text-[#006300]',
  REJECTED: 'bg-status-critical/10 text-status-critical',
  EXPIRED: 'bg-status-warning/15 text-[#8a5a00]',
};

// Catalogue fermé de motifs de refus — évite qu'un opérateur écrive un motif
// arbitraire à chaque fois ; le champ texte associé reste pour le détail.
export const DOCUMENT_REJECTION_REASON_LABELS: Record<string, string> = {
  ILLEGIBLE: 'Document illisible',
  EXPIRED: 'Document expiré',
  WRONG_DOCUMENT: 'Mauvais type de document',
  MISSING_PAGE: 'Page manquante',
  MISMATCH_IDENTITY: "Ne correspond pas à l'identité déclarée",
  MISMATCH_VEHICLE: 'Ne correspond pas au véhicule enregistré',
  INVALID_FORMAT: 'Format de fichier invalide',
  DUPLICATE: 'Doublon',
  INCOMPLETE: 'Informations incomplètes',
  OTHER: 'Autre',
};
