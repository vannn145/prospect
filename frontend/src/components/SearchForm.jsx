import { useState } from 'react';
import { CATEGORY_OPTIONS } from '../utils/labels';

function SearchForm({ onSubmit, loading }) {
  const [form, setForm] = useState({
    city: '',
    category: 'dentist',
    radius: 5000,
  });

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSubmit({
      city: form.city.trim(),
      category: form.category,
      radius: Number(form.radius || 5000),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
      <div className="md:col-span-1">
        <label htmlFor="city" className="mb-1 block text-sm font-medium text-slate-300">
          Cidade
        </label>
        <input
          id="city"
          type="text"
          required
          placeholder="Ex: Campinas"
          value={form.city}
          onChange={(event) => updateField('city', event.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-teal-500"
        />
      </div>

      <div className="md:col-span-1">
        <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-300">
          Categoria
        </label>
        <select
          id="category"
          value={form.category}
          onChange={(event) => updateField('category', event.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 outline-none transition focus:border-teal-500"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-1">
        <label htmlFor="radius" className="mb-1 block text-sm font-medium text-slate-300">
          Raio (metros)
        </label>
        <input
          id="radius"
          type="number"
          min={100}
          step={100}
          value={form.radius}
          onChange={(event) => updateField('radius', event.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 outline-none transition focus:border-teal-500"
        />
      </div>

      <div className="flex items-end md:col-span-1">
        <button
          type="submit"
          disabled={loading}
           className="w-full rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {loading ? 'Buscando...' : 'Buscar empresas'}
        </button>
      </div>
    </form>
  );
}

export default SearchForm;
