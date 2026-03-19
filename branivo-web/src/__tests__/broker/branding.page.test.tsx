/**
 * Component tests for Broker Branding page.
 * Tests font dropdown, WCAG validation, publish button state, and form submission.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrandingPage from '@/app/[locale]/(broker)/branding/page';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock URL object URL helpers (jsdom doesn't implement them)
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe('BrandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as unknown as Response);
  });

  it('shows exactly 5 font options in the dropdown', () => {
    renderWithQuery(<BrandingPage />);

    const select = screen.getByRole('combobox', { name: /шрифт/i });
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(5);

    const fontNames = Array.from(options).map((o) => o.textContent);
    expect(fontNames).toContain('Inter');
    expect(fontNames).toContain('Roboto');
    expect(fontNames).toContain('Lato');
    expect(fontNames).toContain('Poppins');
    expect(fontNames).toContain('Open Sans');
  });

  it('shows WCAG AA pass indicator for default primary color #1A56DB', () => {
    renderWithQuery(<BrandingPage />);
    // Default primary is #1A56DB which passes WCAG AA
    expect(screen.getAllByText(/✓.*AA/)[0]).toBeInTheDocument();
  });

  it('shows WCAG AA fail indicator when non-compliant color entered', async () => {
    renderWithQuery(<BrandingPage />);

    const hexInputs = screen.getAllByRole('textbox');
    // First text input is primary color hex
    fireEvent.change(hexInputs[0], { target: { value: '#FFFF00' } });

    await waitFor(() => {
      expect(
        screen.getByText(/✗.*не отговаря WCAG AA/),
      ).toBeInTheDocument();
    });
  });

  it('disables Запази button when primary color fails WCAG', async () => {
    renderWithQuery(<BrandingPage />);

    const hexInputs = screen.getAllByRole('textbox');
    fireEvent.change(hexInputs[0], { target: { value: '#FFFF00' } });

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', {
        name: /запази брандирането/i,
      });
      expect(submitBtn).toBeDisabled();
    });
  });

  it('enables Запази button when all colors pass WCAG', () => {
    renderWithQuery(<BrandingPage />);
    // Defaults (#1A56DB and #003366) both pass
    const submitBtn = screen.getByRole('button', {
      name: /запази брандирането/i,
    });
    expect(submitBtn).not.toBeDisabled();
  });

  it('submits FormData with primaryColor, secondaryColor and brandFont', async () => {
    renderWithQuery(<BrandingPage />);

    const submitBtn = screen.getByRole('button', {
      name: /запази брандирането/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/branding',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: expect.any(FormData),
        }),
      );
    });

    const formData = (mockFetch.mock.calls[0] as unknown[])[1] as {
      body: FormData;
    };
    expect(formData.body.get('primaryColor')).toBe('#1A56DB');
    expect(formData.body.get('brandFont')).toBe('Inter');
  });

  it('shows success message after successful save', async () => {
    renderWithQuery(<BrandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /запази брандирането/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/брандирането е запазено успешно/i),
      ).toBeInTheDocument();
    });
  });

  it('shows error message when API returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Color #FFFF00 fails WCAG AA contrast' }),
    } as unknown as Response);

    renderWithQuery(<BrandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /запази брандирането/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Color #FFFF00 fails WCAG AA contrast/),
      ).toBeInTheDocument();
    });
  });

  it('shows logo preview after valid file selection', async () => {
    renderWithQuery(<BrandingPage />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(['fake'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const img = screen.getByAltText(/преглед на логото/i);
      expect(img).toBeInTheDocument();
    });
  });

  it('shows error for invalid logo file type', async () => {
    renderWithQuery(<BrandingPage />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(['fake'], 'logo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/само png и svg файлове са разрешени/i),
      ).toBeInTheDocument();
    });
  });
});
