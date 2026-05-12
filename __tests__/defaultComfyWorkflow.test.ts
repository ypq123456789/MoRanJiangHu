import { describe, expect, it } from 'vitest';
import { 默认ComfyUI工作流JSON, 默认NSFWComfyUI工作流JSON } from '../data/defaultComfyWorkflow';
import { 默认功能模型占位, 规范化接口设置 } from '../utils/apiConfig';

describe('默认 ComfyUI 生图配置', () => {
    it('uses the bundled z-image turbo workflow for both normal and NSFW image workflows', () => {
        const workflow = JSON.parse(默认功能模型占位.ComfyUI工作流JSON);
        const nsfwWorkflow = JSON.parse(默认功能模型占位.NSFWComfyUI工作流JSON);

        expect(默认功能模型占位.文生图后端类型).toBe('comfyui');
        expect(默认功能模型占位.ComfyUI工作流JSON).toBe(默认ComfyUI工作流JSON);
        expect(默认功能模型占位.NSFWComfyUI工作流JSON).toBe(默认NSFWComfyUI工作流JSON);
        expect(默认ComfyUI工作流JSON).toBe(默认NSFWComfyUI工作流JSON);
        expect(workflow['45'].inputs.text).toBe('__PROMPT__');
        expect(workflow['41'].inputs.width).toBe('__WIDTH__');
        expect(workflow['41'].inputs.height).toBe('__HEIGHT__');
        expect(workflow['44'].inputs.seed).toBe('__SEED__');
        expect(workflow['44'].inputs.steps).toBe('__STEPS__');
        expect(workflow['44'].inputs.cfg).toBe('__CFG__');
        expect(workflow['44'].inputs.sampler_name).toBe('__SAMPLER__');
        expect(workflow['44'].inputs.scheduler).toBe('__SCHEDULER__');
        expect(workflow['44'].inputs.model).toEqual(['47', 0]);
        expect(workflow['46'].inputs.unet_name).toBe('mPMix_NSFW_V9_fp8.safetensors');
        expect(workflow['39'].inputs.clip_name).toBe('qwen_3_4b.safetensors');
        expect(workflow['49'].inputs.unet_name).toBe('qwen-image-2512-Q6_K.gguf');
        expect(nsfwWorkflow['46'].inputs.unet_name).toBe('mPMix_NSFW_V9_fp8.safetensors');
    });

    it('fills the default workflow when old settings have no ComfyUI workflow', () => {
        const settings = 规范化接口设置({
            功能模型占位: {
                文生图后端类型: 'openai',
                文生图模型使用模型: '',
                文生图模型API地址: '',
                文生图模型API密钥: '',
                ComfyUI工作流JSON: ''
            }
        });

        expect(settings.功能模型占位.文生图后端类型).toBe('comfyui');
        expect(settings.功能模型占位.ComfyUI工作流JSON).toBe(默认ComfyUI工作流JSON);
    });
});
