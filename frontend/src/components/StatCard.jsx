function StatCard({ title, value }) {
  return (
      <div className="rounded-xl border-l-4 border border-slate-700 border-l-teal-500 bg-slate-800 p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-400">{title}</p>
        <p className="mt-2 text-3xl font-bold text-green-400">{value}</p>
    </div>
  );
}

export default StatCard;
