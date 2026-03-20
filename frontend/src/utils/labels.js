export const CATEGORY_OPTIONS = [
  { value: 'dentist', label: 'Dentista' },
  { value: 'lawyer', label: 'Advogado' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'bakery', label: 'Padaria' },
  { value: 'pharmacy', label: 'Farmácia' },
  { value: 'supermarket', label: 'Mercado' },
  { value: 'gym', label: 'Academia' },
  { value: 'beauty_salon', label: 'Salão de beleza' },
  { value: 'pet_store', label: 'Pet shop' },
  { value: 'veterinary_care', label: 'Clínica veterinária' },
  { value: 'physiotherapist', label: 'Fisioterapia' },
  { value: 'real_estate_agency', label: 'Imobiliária' },
  { value: 'accountant', label: 'Contabilidade' },
  { value: 'insurance_agency', label: 'Seguros' },
  { value: 'car_repair', label: 'Oficina mecânica' },
  { value: 'hardware_store', label: 'Loja de materiais' },
  { value: 'clothing_store', label: 'Loja de roupas' },
  { value: 'electronics_store', label: 'Loja de eletrônicos' },
  { value: 'school', label: 'Escola' },
  { value: 'travel_agency', label: 'Agência de viagens' },
];

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map(({ value, label }) => [value, label])
);

CATEGORY_LABELS.accounting = 'Contabilidade';

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
