import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClockIcon, PlayIcon, PauseIcon, SquareIcon, CoffeeIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { MyAttendance, TeamAttendanceRow, AttendanceAction } from '../../types/attendance';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = { active: 'green', on_break: 'amber', off: 'gray' };
const STATUS_LABEL: Record<string, string> = { active: 'Clocked in', on_break: 'On break', off: 'Off duty' };

export function Attendance() {
  const [mine, setMine] = useState<MyAttendance | null>(null);
  const [team, setTeam] = useState<TeamAttendanceRow[]>([]);
  const [acting, setActing] = useState(false);

  const loadMine = () => {
    api
      .get<MyAttendance>('/attendance/me')
      .then(setMine)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load your attendance'));
  };
  const loadTeam = () => {
    api
      .get<{ attendance: TeamAttendanceRow[] }>('/attendance')
      .then(({ attendance }) => setTeam(attendance))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load team attendance'));
  };

  useEffect(() => {
    loadMine();
    loadTeam();
  }, []);

  const act = async (action: AttendanceAction) => {
    setActing(true);
    try {
      const updated = await api.post<MyAttendance>('/attendance/me', { action });
      setMine(updated);
      loadTeam();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update attendance');
    } finally {
      setActing(false);
    }
  };

  const status = mine?.status ?? 'off';

  return (
    <div>
      <PageHeader title="Attendance" description="Clock in/out and see who's working today." />

      <Card className="mb-6">
        <CardHeader title="My attendance" subtitle="Today" />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>
            {mine?.hoursWorked != null && <span className="text-sm text-text-gray dark:text-slate-400">{mine.hoursWorked} hrs today</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={status !== 'off'} loading={acting} onClick={() => act('clock_in')}>
              <PlayIcon className="h-3.5 w-3.5" /> Clock in
            </Button>
            <Button size="sm" variant="secondary" disabled={status !== 'active'} loading={acting} onClick={() => act('start_break')}>
              <CoffeeIcon className="h-3.5 w-3.5" /> Start break
            </Button>
            <Button size="sm" variant="secondary" disabled={status !== 'on_break'} loading={acting} onClick={() => act('end_break')}>
              <PauseIcon className="h-3.5 w-3.5" /> End break
            </Button>
            <Button size="sm" variant="ghost" disabled={status === 'off'} loading={acting} onClick={() => act('clock_out')}>
              <SquareIcon className="h-3.5 w-3.5" /> Clock out
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Team today" subtitle="Every staff member and technician's status" />
        {team.length === 0 ?
        <EmptyState icon={ClockIcon} title="No attendance yet today" description="Once someone clocks in, they'll show up here." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {team.map((row) =>
          <li key={`${row.subjectType}-${row.subjectId}`} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{row.name ?? 'Unknown'}</p>
                  <p className="text-xs text-text-gray dark:text-slate-400">{row.subjectType}{row.hoursWorked != null && ` · ${row.hoursWorked} hrs`}</p>
                </div>
                <Badge tone={STATUS_TONE[row.status]} dot>{STATUS_LABEL[row.status]}</Badge>
              </li>
          )}
          </ul>
        }
      </Card>
    </div>);

}
