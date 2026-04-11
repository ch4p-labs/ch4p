import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLogs } from './logs.js';

vi.mock('../config.js', () => ({
  getLogsDir: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
  };
});

import { getLogsDir } from '../config.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const mockGetLogsDir = vi.mocked(getLogsDir);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockGetLogsDir.mockReturnValue('/tmp/test-logs');
});

describe('getLogs', () => {
  it('returns empty when logs dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = getLogs();
    expect(result.entries).toEqual([]);
    expect(result.available).toEqual([]);
    expect(result.logsDir).toBe('/tmp/test-logs');
  });

  it('returns empty when no log files exist', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    const result = getLogs();
    expect(result.entries).toEqual([]);
    expect(result.available).toEqual([]);
  });

  it('reads stdout and stderr log files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'gateway-stderr.log',
      'gateway-stdout.log',
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('stdout')) return 'line1\nline2\nline3\n';
      if (p.includes('stderr')) return 'err1\nerr2\n';
      return '';
    });

    mockStatSync.mockReturnValue({
      size: 1024,
      mtime: new Date('2026-03-17T12:00:00Z'),
    } as ReturnType<typeof statSync>);

    const result = getLogs();
    expect(result.entries).toHaveLength(2);
    expect(result.available).toEqual(['gateway-stderr.log', 'gateway-stdout.log']);

    const stdout = result.entries.find(e => e.source === 'stdout');
    expect(stdout?.lines).toEqual(['line1', 'line2', 'line3']);
    expect(stdout?.size).toBe(1024);

    const stderr = result.entries.find(e => e.source === 'stderr');
    expect(stderr?.lines).toEqual(['err1', 'err2']);
  });

  it('respects maxLines parameter', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'gateway-stdout.log',
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockReturnValue('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n');
    mockStatSync.mockReturnValue({
      size: 20,
      mtime: new Date(),
    } as ReturnType<typeof statSync>);

    const result = getLogs(3);
    const stdout = result.entries[0];
    expect(stdout?.lines).toEqual(['h', 'i', 'j']);
  });

  it('picks the most recent log file by name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'gateway.stdout.log',
      'gateway-stdout.log',
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockReturnValue('latest\n');
    mockStatSync.mockReturnValue({
      size: 7,
      mtime: new Date(),
    } as ReturnType<typeof statSync>);

    const result = getLogs();
    // Should read gateway.stdout.log (alphabetically last: '.' > '-')
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.file).toBe('gateway.stdout.log');
  });

  it('includes all log files in available list', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'gateway-stderr.log',
      'gateway-stdout.log',
      'gateway.stderr.log',
      'gateway.stdout.log',
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockReturnValue('data\n');
    mockStatSync.mockReturnValue({
      size: 5,
      mtime: new Date(),
    } as ReturnType<typeof statSync>);

    const result = getLogs();
    expect(result.available).toHaveLength(4);
  });
});
