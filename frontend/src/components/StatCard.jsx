function StatCard({ title, value, icon }) {
  return (
    <div className="rounded-xl border border-l-4 border-slate-700 border-l-teal-500 bg-slate-800 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-400">
            {icon}
          </span>
        )}
        <p className="text-sm font-medium leading-tight text-slate-400">{title}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-green-400">{value}</p>
    </div>
  );
}

export default StatCard;
