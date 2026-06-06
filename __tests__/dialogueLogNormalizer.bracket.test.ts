import { 规范化对白日志 } from '../utils/dialogueLogNormalizer';
import { describe, test, expect } from 'vitest';

describe('dialogueLogNormalizer bracket tests', () => {
  test('unlabeled quoted sentence remains narration', () => {
    const input = [
      { sender: '旁白', text: '吴杰涛的手猛地一抖……\n“我操……”' }
    ];
    const out = 规范化对白日志(input);
    expect(out.some(item => item.sender !== '旁白')).toBe(false);
    expect(out.some(item => (item.text || '').includes('我操'))).toBe(true);
  });

  test('bracketed speaker produces dialogue', () => {
    const input = [
      { sender: '旁白', text: '【吴杰涛】“我操……”' }
    ];
    const out = 规范化对白日志(input);
    expect(out.some(item => item.sender === '吴杰涛' && (item.text || '').includes('我操'))).toBe(true);
  });
});
