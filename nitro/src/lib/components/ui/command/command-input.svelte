<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";


	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div data-slot="command-input-wrapper" class="w-full">
	<InputGroup.Root class="!border-0 !h-16 !rounded-none !shadow-none !ring-0 focus-within:!ring-0 has-[[data-slot=input-group-control]:focus-visible]:!ring-0 bg-transparent *:data-[slot=input-group-addon]:!pl-4">
		<CommandPrimitive.Input
			{value}
			data-slot="command-input"
			class={cn(
				"w-full text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
			{...restProps}
		>
			{#snippet child({ props })}
				<InputGroup.Input {...props} bind:value bind:ref />
			{/snippet}
		</CommandPrimitive.Input>

	</InputGroup.Root>
</div>
