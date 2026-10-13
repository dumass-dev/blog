import React, { useEffect, useState, useMemo, useRef } from 'react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function GitHubContributions({
  username = 'q04ti',
  showHeader = true,
  minimal = false
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [tooltip, setTooltip] = useState(null);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/github-contributions?username=${encodeURIComponent(username)}`)
      .then(async res => {
        if (!res.ok) throw new Error('Could not load contribution data');
        return res.json();
      })
      .then(resData => {
        if (!isMounted) return;
        setData(resData);
        if (resData.years && resData.years.length > 0) {
          const currentYear = String(new Date().getFullYear());
          if (resData.years.includes(currentYear)) {
            setSelectedYear(currentYear);
          } else {
            setSelectedYear(resData.years[0]);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err.message || 'Failed to load GitHub activity');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [username]);

  // Scroll to the end (most recent dates) on mount or year change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [selectedYear, loading]);

  // Filter contributions for the selected year and organize into a 53-week grid
  const { weeks, monthLabels, totalForYear } = useMemo(() => {
    if (!data || !data.contributions || data.contributions.length === 0) {
      return { weeks: [], monthLabels: [], totalForYear: 0 };
    }

    const yearContributions = data.contributions.filter(c => c.date.startsWith(selectedYear));
    const contributionMap = new Map();
    yearContributions.forEach(c => contributionMap.set(c.date, c));

    const yearNum = parseInt(selectedYear, 10) || new Date().getFullYear();
    const startDate = new Date(Date.UTC(yearNum, 0, 1));
    const endDate = new Date(Date.UTC(yearNum, 11, 31));

    const startDayOfWeek = startDate.getUTCDay();
    const firstSunday = new Date(startDate);
    firstSunday.setUTCDate(startDate.getUTCDate() - startDayOfWeek);

    const calculatedWeeks = [];
    let currentDay = new Date(firstSunday);
    const months = [];
    let lastMonth = -1;
    let weekIndex = 0;

    while (currentDay <= endDate || calculatedWeeks.length < 52) {
      const week = [];
      let weekHasTargetMonthChange = false;
      let targetMonth = -1;

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dateStr = currentDay.toISOString().slice(0, 10);
        const isCurrentYear = currentDay.getUTCFullYear() === yearNum;
        const entry = isCurrentYear ? contributionMap.get(dateStr) : null;

        week.push({
          date: dateStr,
          count: entry ? entry.count : 0,
          level: entry ? entry.level : 0,
          isCurrentYear
        });

        if (isCurrentYear && currentDay.getUTCDate() <= 7 && currentDay.getUTCMonth() !== lastMonth) {
          weekHasTargetMonthChange = true;
          targetMonth = currentDay.getUTCMonth();
        }

        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
      }

      if (weekHasTargetMonthChange && targetMonth !== -1 && targetMonth !== lastMonth) {
        months.push({
          label: MONTH_NAMES[targetMonth],
          weekIndex
        });
        lastMonth = targetMonth;
      }

      calculatedWeeks.push(week);
      weekIndex++;

      if (weekIndex > 54) break;
    }

    const totalCount = data.total && typeof data.total[selectedYear] === 'number'
      ? data.total[selectedYear]
      : yearContributions.reduce((sum, c) => sum + (c.count || 0), 0);

    return {
      weeks: calculatedWeeks,
      monthLabels: months,
      totalForYear: totalCount
    };
  }, [data, selectedYear]);

  // Square colors based on level (matching site's pure dark and light backgrounds)
  const getCellFill = (level, isCurrentYear) => {
    if (!isCurrentYear) return 'transparent';
    switch (level) {
      case 1:
        return 'var(--gh-level-1, #0e4429)';
      case 2:
        return 'var(--gh-level-2, #006d32)';
      case 3:
        return 'var(--gh-level-3, #26a641)';
      case 4:
        return 'var(--gh-level-4, #39d353)';
      default:
        return 'var(--gh-level-0, rgba(255, 255, 255, 0.05))';
    }
  };

  const handleMouseEnter = (day, e) => {
    if (!day.isCurrentYear) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const formattedDate = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });

    setTooltip({
      count: day.count,
      date: formattedDate,
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  if (loading) {
    return (
      <div className="w-full bg-transparent py-4 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-[var(--border-subtle)]/60 rounded w-1/3"></div>
          <div className="h-4 bg-[var(--border-subtle)]/40 rounded w-24"></div>
        </div>
        <div className="h-28 bg-[var(--border-subtle)]/20 rounded-lg w-full"></div>
      </div>
    );
  }

  if (error) {
    return null; // Fail gracefully and silently in minimal view
  }

  const years = data?.years || ['2026', '2025', '2024'];

  return (
    <div className={`w-full bg-transparent transition-all relative font-sans text-xs ${minimal ? 'py-2' : 'py-4'}`}>
      {/* Header Row: Minimal Count & Year Selector */}
      {showHeader && (
        <div className="flex flex-row items-center justify-between gap-3 mb-4 select-none">
          <div className="text-xs sm:text-sm font-sans text-[var(--text-secondary)] font-normal tracking-tight">
            <span className="text-[var(--text-primary)] font-medium">{totalForYear.toLocaleString()}</span> contributions in {selectedYear}
          </div>

          {/* Minimal Year Selector */}
          <div className="flex items-center space-x-2 text-xs font-sans">
            {years.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`transition-colors cursor-pointer text-xs py-0.5 px-1.5 rounded ${
                  selectedYear === year
                    ? 'text-[var(--text-primary)] font-medium underline underline-offset-4 decoration-[1px]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap Grid Container (Scrollable on Mobile, flush background) */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[var(--border-subtle)] scrollbar-track-transparent"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="min-w-[700px] select-none py-0.5">
          <svg
            viewBox="0 0 740 115"
            className="w-full h-auto block"
            style={{ shapeRendering: 'geometricPrecision' }}
          >
            {/* Month Labels */}
            {monthLabels.map(m => (
              <text
                key={`${m.label}-${m.weekIndex}`}
                x={30 + m.weekIndex * 13}
                y="10"
                fill="var(--text-muted)"
                fontSize="9.5"
                fontFamily="inherit"
              >
                {m.label}
              </text>
            ))}

            {/* Weekday Labels (Mon, Wed, Fri) */}
            <text x="6" y="39" fill="var(--text-muted)" fontSize="8.5" fontFamily="inherit">
              Mon
            </text>
            <text x="6" y="65" fill="var(--text-muted)" fontSize="8.5" fontFamily="inherit">
              Wed
            </text>
            <text x="6" y="91" fill="var(--text-muted)" fontSize="8.5" fontFamily="inherit">
              Fri
            </text>

            {/* 53 Weeks Grid */}
            <g transform="translate(30, 20)">
              {weeks.map((week, wIdx) => (
                <g key={wIdx} transform={`translate(${wIdx * 13}, 0)`}>
                  {week.map((day, dIdx) => {
                    const fill = getCellFill(day.level, day.isCurrentYear);
                    return (
                      <rect
                        key={day.date}
                        x="0"
                        y={dIdx * 13}
                        width="10"
                        height="10"
                        rx="2"
                        ry="2"
                        fill={fill}
                        stroke={day.isCurrentYear ? (day.level === 0 ? 'var(--gh-border-0, rgba(255, 255, 255, 0.04))' : 'transparent') : 'transparent'}
                        strokeWidth="0.5"
                        className={day.isCurrentYear ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                        onMouseEnter={(e) => handleMouseEnter(day, e)}
                        onMouseLeave={handleMouseLeave}
                      />
                    );
                  })}
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Minimal Legend (Right-aligned, subtle) */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[10px] font-sans text-[var(--text-muted)] select-none">
        <span>Less</span>
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-0, rgba(255, 255, 255, 0.05))', border: '0.5px solid var(--gh-border-0, rgba(255, 255, 255, 0.06))' }} />
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-1, #0e4429)' }} />
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-2, #006d32)' }} />
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-3, #26a641)' }} />
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-4, #39d353)' }} />
        <span>More</span>
      </div>

      {/* Floating Hover Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full px-2 py-1 rounded bg-[var(--bg-main)] text-[var(--text-primary)] text-[11px] font-sans border border-[var(--border-subtle)] shadow-xl whitespace-nowrap animate-content-fade"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span className="font-medium">
            {tooltip.count === 0 ? 'No contributions' : `${tooltip.count} contribution${tooltip.count === 1 ? '' : 's'}`}
          </span>{' '}
          <span className="text-[var(--text-muted)]">on {tooltip.date}</span>
        </div>
      )}
    </div>
  );
}
