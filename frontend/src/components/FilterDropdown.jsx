// One collapsed filter for the mobile/tablet row in FilterBar — a labelled
// button showing only the current value, opening a small options panel on
// tap. Purely presentational: which panel is open lives in FilterBar's
// single `openPanel` state, not here, so this component has no state of its
// own beyond what its props already carry.
export default function FilterDropdown({ group, value, isOpen, onToggle, onSelect, panelAlign = 'left' }) {
  const selectedOption = group.options.find((option) => option.value === value)

  return (
    // A flex column, not a plain block: the grid row stretches every column
    // to the same height (grid's default align-items: stretch), but a
    // block-level column would just leave any extra height as dead space
    // below its button — that's what let a short one-line label ("METRIC")
    // leave its button sitting higher than a two-line label's ("TIME
    // WINDOW") button below it. flex-col + mt-auto on the button wrapper
    // instead collapses that extra space ABOVE the button, so all four
    // buttons land on the same bottom edge regardless of label height.
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs font-normal text-neutral-400">{group.label}</p>

      <div className="relative mt-auto">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-12 w-full items-center justify-center rounded border border-neutral-700 bg-neutral-950 px-1 text-center text-sm leading-tight text-neutral-200"
        >
          {selectedOption ? selectedOption.label : value}
        </button>

        {isOpen && (
          <div
            className={`absolute z-10 mt-1 w-32 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg ${
              panelAlign === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {group.options.map((option) => {
              const isActive = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={
                    isActive
                      ? 'block w-full rounded bg-neutral-800 px-2 py-1.5 text-left text-sm text-white'
                      : 'block w-full rounded px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-800'
                  }
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
