// cn: 合并 className 工具函数 (仅依赖 clsx, 不依赖 tailwind)
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
