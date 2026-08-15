import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps } from "svelte";
import type { Action } from "svelte/action";
import type { HTMLAttributes } from "svelte/elements";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Builder = {
	action: Action;
	[x: string]: any;
};

type OmitMultiple<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

export type WithoutChildren<T> = OmitMultiple<T, "children">;
export type WithoutChild<T> = OmitMultiple<T, "child">;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T> = T & { ref?: HTMLElement | null };
