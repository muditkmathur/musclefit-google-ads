'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { CampaignReport } from '@/types/google-ads';
import { getCampaignReport } from '@/app/actions/google-ads';

export default function CampaignReportCard() {
  const [days, setDays] = useState<number>(30);
  const [includeDaily, setIncludeDaily] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await getCampaignReport({ days, includeDaily });
      if (!result.ok) throw new Error(result.error);
      setReport(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" className="rounded-xl">
      <CardHeader
        title="Campaign Report"
        subheader="Active campaign performance over the selected window."
      />
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
          className="mb-4"
        >
          <TextField
            type="number"
            label="Days"
            size="small"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            inputProps={{ min: 1, max: 365 }}
            className="w-full sm:w-32"
          />
          <FormControlLabel
            control={
              <Switch
                checked={includeDaily}
                onChange={(e) => setIncludeDaily(e.target.checked)}
              />
            }
            label="Include daily DoD"
          />
          <Button
            variant="contained"
            onClick={run}
            disabled={loading}
            startIcon={
              loading ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {loading ? 'Running…' : 'Run report'}
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" className="mb-4">
            {error}
          </Alert>
        )}

        {report && (
          <Box>
            <Typography variant="body2" color="text.secondary" className="mb-2">
              {report.period} ({report.date_range.start} → {report.date_range.end}) · {report.campaigns.length} campaigns
            </Typography>
            <TableContainer component="div" className="border rounded-lg">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Campaign</TableCell>
                    <TableCell align="right">Impr.</TableCell>
                    <TableCell align="right">Clicks</TableCell>
                    <TableCell align="right">CTR</TableCell>
                    <TableCell align="right">Avg. CPC</TableCell>
                    <TableCell align="right">Spend</TableCell>
                    <TableCell align="right">Conv.</TableCell>
                    <TableCell align="right">CPA</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.campaigns.map((c) => (
                    <TableRow key={c.campaign} hover>
                      <TableCell className="font-medium">{c.campaign}</TableCell>
                      <TableCell align="right">{c.impressions.toLocaleString()}</TableCell>
                      <TableCell align="right">{c.clicks.toLocaleString()}</TableCell>
                      <TableCell align="right">{c.ctr}</TableCell>
                      <TableCell align="right">{c.avg_cpc}</TableCell>
                      <TableCell align="right">{c.spend}</TableCell>
                      <TableCell align="right">{c.conversions}</TableCell>
                      <TableCell align="right">{c.cpa}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-100 font-semibold">
                    <TableCell>{report.totals.campaign}</TableCell>
                    <TableCell align="right">{report.totals.impressions.toLocaleString()}</TableCell>
                    <TableCell align="right">{report.totals.clicks.toLocaleString()}</TableCell>
                    <TableCell align="right">{report.totals.ctr}</TableCell>
                    <TableCell align="right">{report.totals.avg_cpc}</TableCell>
                    <TableCell align="right">{report.totals.spend}</TableCell>
                    <TableCell align="right">{report.totals.conversions}</TableCell>
                    <TableCell align="right">{report.totals.cpa}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
