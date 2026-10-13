import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ExternalLink, Calendar, GitCommit } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function GitHubContributions({ username = 'q04ti', showHeader = true, compact = false }) {
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
        // Default to the first available year or 2026
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

    // Calculate dates for the entire year (Jan 1 to Dec 31)
    const yearNum = parseInt(selectedYear, 10) || new Date().getFullYear();
    const startDate = new Date(Date.UTC(yearNum, 0, 1));
    const endDate = new Date(Date.UTC(yearNum, 11, 31));

    // Build day list starting from the Sunday on or before Jan 1
    const startDayOfWeek = startDate.getUTCDay(); // 0 = Sun
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

        // Track month transitions for labels (look at the first day of each month)
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

      // Safety bound to avoid infinite loop
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

  // Square colors based on level (clean GitHub style in dark/light mode)
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
        return 'var(--gh-level-0, rgba(255, 255, 255, 0.06))';
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
      <div className="w-full bg-[var(--code-bg)] border border-[var(--border-subtle)] rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-[var(--border-subtle)] rounded w-1/4 mb-4"></div>
        <div className="h-32 bg-[var(--border-subtle)]/40 rounded-lg w-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-[var(--code-bg)] border border-[var(--border-subtle)] rounded-xl p-4 text-xs text-[var(--text-muted)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 opacity-70" />
          <span>GitHub activity temporarily unavailable.</span>
        </div>
        <a
          href={`https://github.com/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--text-primary)] transition-colors underline flex items-center gap-1"
        >
          View profile <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  const years = data?.years || ['2026', '2025', '2024'];

  return (
    <div className={`w-full bg-[var(--code-bg)] border border-[var(--border-subtle)] rounded-xl ${compact ? 'p-4' : 'p-5 sm:p-6'} transition-all relative font-sans text-xs`}>
      {/* Header Row: Title & Year Tabs */}
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <GitCommit className="w-4 h-4 text-[var(--text-muted)] opacity-80" />
            <h3 className="font-serif text-base sm:text-lg font-normal text-[var(--text-primary)] tracking-tight">
              {totalForYear.toLocaleString()} {totalForYear === 1 ? 'contribution' : 'contributions'} in {selectedYear}
            </h3>
          </div>

          {/* Year selector pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto pb-1 sm:pb-0">
            {years.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1 rounded-md text-xs font-sans transition-all cursor-pointer ${
                  selectedYear === year
                    ? 'bg-[#2f81f7] text-white font-medium shadow-sm'
                    : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/40'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap Grid Container (Horizontally Scrollable on Mobile) */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[var(--border-subtle)] scrollbar-track-transparent"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="min-w-[700px] select-none py-1">
          <svg
            viewBox="0 0 740 120"
            className="w-full h-auto block"
            style={{ shapeRendering: 'geometricPrecision' }}
          >
            {/* Month Labels */}
            {monthLabels.map(m => (
              <text
                key={`${m.label}-${m.weekIndex}`}
                x={30 + m.weekIndex * 13}
                y="12"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="inherit"
              >
                {m.label}
              </text>
            ))}

            {/* Weekday Labels (Mon, Wed, Fri) */}
            <text x="5" y="42" fill="var(--text-muted)" fontSize="9" fontFamily="inherit">
              Mon
            </text>
            <text x="5" y="68" fill="var(--text-muted)" fontSize="9" fontFamily="inherit">
              Wed
            </text>
            <text x="5" y="94" fill="var(--text-muted)" fontSize="9" fontFamily="inherit">
              Fri
            </text>

            {/* 53 Weeks Grid */}
            <g transform="translate(30, 22)">
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
                        stroke={day.isCurrentYear ? 'var(--border-subtle)' : 'transparent'}
                        strokeWidth={day.isCurrentYear ? '0.5' : '0'}
                        className={day.isCurrentYear ? 'cursor-pointer hover:stroke-[var(--text-primary)] transition-all' : ''}
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

      {/* Footer / Legend */}
      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <a
          href={`https://github.com/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
        >
          <span>github.com/{username}</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>

        {/* Less / More Legend */}
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-0, rgba(255, 255, 255, 0.06))', border: '0.5px solid var(--border-subtle)' }} />
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-1, #0e4429)' }} />
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-2, #006d32)' }} />
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-3, #26a641)' }} />
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--gh-level-4, #39d353)' }} />
          <span>More</span>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-md bg-[#161b22] text-[#f0f6fc] text-[11px] font-sans border border-[#30363d] shadow-xl whitespace-nowrap animate-content-fade"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span className="font-medium text-white">
            {tooltip.count === 0 ? 'No contributions' : `${tooltip.count} contribution${tooltip.count === 1 ? '' : 's'}`}
          </span>{' '}
          <span className="text-[#8b949e]">on {tooltip.date}</span>
        </div>
      )}
    </div>
  );
}
