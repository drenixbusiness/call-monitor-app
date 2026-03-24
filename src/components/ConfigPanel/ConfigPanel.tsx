'use client';

import { Box, Typography, TextField, Button, Alert } from '@mui/material';

export default function ConfigPanel({
  credentials,
  onChange,
  onLoad,
  isLoading,
  loadingMsg,
  error,
  deployHint,
}: {
  credentials: any;
  onChange: (field: string, value: string) => void;
  onLoad: () => void;
  isLoading: boolean;
  loadingMsg: string;
  error: string | null;
  deployHint?: string;
}) {
  return (
    <Box sx={{ 
        width: '100%', 
        maxWidth: 800, 
        mx: 'auto', 
        mt: 8, 
        p: 4, 
        borderRadius: 3, 
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        animation: 'fadeUp 0.6s ease-out forwards'
    }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        API Configuration
      </Typography>

      {deployHint && (
        <Typography sx={{ mb: 3, fontSize: '0.9rem', color: 'var(--text2)', lineHeight: 1.5 }}>
          {deployHint}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 4, backgroundColor: 'rgba(255, 69, 102, 0.1)', color: 'var(--red)', border: '1px solid var(--red)' }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, mb: 3 }}>
        <TextField
          label="Client ID"
          variant="outlined"
          size="small"
          value={credentials.clientId}
          onChange={(e) => onChange('clientId', e.target.value)}
          sx={{ input: { color: 'var(--text)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border2)' } }}
        />
        <TextField
          label="Client Secret"
          type="password"
          variant="outlined"
          size="small"
          value={credentials.clientSecret}
          onChange={(e) => onChange('clientSecret', e.target.value)}
          sx={{ input: { color: 'var(--text)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border2)' } }}
        />
        <TextField
          label="JWT Token"
          type="password"
          variant="outlined"
          size="small"
          value={credentials.jwt}
          onChange={(e) => onChange('jwt', e.target.value)}
          sx={{ input: { color: 'var(--text)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border2)' } }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button 
          variant="contained" 
          onClick={onLoad} 
          disabled={isLoading}
          sx={{ 
              backgroundColor: 'var(--accent)', 
              color: '#000', 
              fontWeight: 700,
              textTransform: 'none',
              px: 4,
              '&:hover': { backgroundColor: '#00b8d4' },
              '&.Mui-disabled': { backgroundColor: 'var(--surface2)', color: 'var(--text3)' }
          }}
        >
          {isLoading ? loadingMsg : 'Load Dashboard'}
        </Button>
      </Box>
    </Box>
  );
}
