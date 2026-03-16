export const CATEGORY_OPTIONS = [
  { value: 'dentist', label: 'Dentista' },
  { value: 'lawyer', label: 'Advogado' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'gym', label: 'Academia' },
  { value: 'beauty_salon', label: 'Salão de beleza' },
  { value: 'pet_store', label: 'Pet shop' },
  { value: 'real_estate_agency', label: 'Imobiliária' },
  { value: 'accounting', label: 'Contabilidade' },
];

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map(({ value, label }) => [value, label])
);

export const STATUS_SITE_LABELS = {
  sem_site: 'Sem site',
  site_fraco: 'Site fraco',
  site_ok: 'Site ok',
};

export function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || value || '-';
}

export function getStatusSiteLabel(value) {
  return STATUS_SITE_LABELS[value] || value || '-';
}
