'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { SearchTermsReport } from '@/types/google-ads';
import { getSearchTermsReport } from '@/app/actions/google-ads';

export default function SearchTermsCard() {
  const [months, setMonths] = useState<number>(3);
  const [campaign, setCampaign] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SearchTermsReport | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await getSearchTermsReport({
        months,
        campaign: campaign.trim() || null,
      });
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
        title="Search Terms"
        subheader="Top search queries triggering ads in the selected window."
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
            label="Months"
            size="small"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) || 3)}
            inputProps={{ min: 1, max: 24 }}
            className="w-full sm:w-32"
          />
          <TextField
            label="Campaign filter"
            size="small"
            placeholder="e.g. WhatsApp"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="contained"
            onClick={run}
            disabled={loading}
            startIcon={
              loading ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {loading ? 'Loading…' : 'Fetch terms'}
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" className="mb-4">
            {error}
          </Alert>
        )}

        {report && (
          <Box>
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              className="mb-3"
              useFlexGap
            >
              <Chip
                size="small"
                label={`${report.totalTerms} terms`}
                color="primary"
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Clicks: ${report.summary.totalClicks.toLocaleString()}`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Impr.: ${report.summary.totalImpressions.toLocaleString()}`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`CTR: ${(report.summary.overallCtr * 100).toFixed(2)}%`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Spend: ₹${report.summary.totalCost.toFixed(2)}`}
                variant="outlined"
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" className="mb-2">
              {report.dateRange.start} → {report.dateRange.end}
              {report.campaignFilter ? ` · filter: "${report.campaignFilter}"` : ''}
            </Typography>
            <TableContainer
              component="div"
              className="border rounded-lg max-h-[480px] overflow-auto"
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Search term</TableCell>
                    <TableCell>Campaign</TableCell>
                    <TableCell>Ad group</TableCell>
                    <TableCell align="right">Clicks</TableCell>
                    <TableCell align="right">Impr.</TableCell>
                    <TableCell align="right">CTR</TableCell>
                    <TableCell align="right">Spend</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.rows.slice(0, 200).map((r, idx) => (
                    <TableRow key={`${r.searchTerm}-${idx}`} hover>
                      <TableCell>{r.searchTerm}</TableCell>
                      <TableCell>{r.campaign}</TableCell>
                      <TableCell>{r.adGroup}</TableCell>
                      <TableCell align="right">{r.clicks.toLocaleString()}</TableCell>
                      <TableCell align="right">{r.impressions.toLocaleString()}</TableCell>
                      <TableCell align="right">{(r.ctr * 100).toFixed(2)}%</TableCell>
                      <TableCell align="right">₹{r.cost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {report.rows.length > 200 && (
              <Typography variant="caption" color="text.secondary">
                Showing first 200 of {report.rows.length} rows.
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
