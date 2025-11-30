import {
  PopoverContent,
  Popover,
  PopoverTrigger,
} from "@decocms/ui/components/popover.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { cn } from "@decocms/ui/lib/utils.ts";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { useMemo, useState } from "react";
import {
  Form,
  FormControl,
  FormItem,
  FormLabel,
} from "@decocms/ui/components/form.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import { useForm } from "react-hook-form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@decocms/ui/components/select.tsx";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@decocms/ui/components/collapsible.tsx";
import { Separator } from "@decocms/ui/components/separator.tsx";
import { toast } from "@decocms/ui/components/sonner.tsx";

export function StepOptions({ stepName }: { stepName: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-8 rounded-xl p-0")}
        >
          <Icon name="settings" className="text-muted-foreground" size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <OptionsForm options={{}} stepName={stepName} />
      </PopoverContent>
    </Popover>
  );
}

function OptionsForm({
  options,
  stepName,
}: {
  options: any;
  stepName: string;
}) {
  const handleSave = async (data: any) => {
    try {
      form.reset(data);
      toast.success("Options saved successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save options");
    }
  };
  const [isRetriesOpen, setIsRetriesOpen] = useState(true);
  const form = useForm<any>({
    defaultValues: options,
  });
  const handleSubmit = (data: any) => {
    handleSave(data);
  };

  const backoff = form.watch("retries.backoff");
  const formState = form.formState;
  const isDirty = formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-2">
        <Collapsible open={isRetriesOpen} onOpenChange={setIsRetriesOpen}>
          <div className="flex w-full justify-between items-center">
            <h2 className="text-md font-medium">Retries</h2>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="icon">
                <Icon
                  name="keyboard_arrow_down"
                  className={cn(
                    "text-muted-foreground",
                    !isRetriesOpen && "rotate-180",
                  )}
                  size={20}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-2">
            <FormItem className="flex flex-col gap-1">
              <FormLabel className="uppercase text-xs">Limit</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...form.register("retries.limit", {
                    valueAsNumber: true,
                    min: 0,
                    validate: (value) =>
                      Number.isInteger(value) || "Must be an integer",
                  })}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-col gap-1">
              <FormLabel className="uppercase text-xs">
                Delay{" "}
                <small className="text-[10px] text-muted-foreground">
                  in milliseconds
                </small>
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...form.register("retries.delay", {
                    valueAsNumber: true,
                    min: 0,
                    validate: (value) =>
                      Number.isInteger(value) || "Must be an integer",
                  })}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-col gap-1">
              <FormLabel className="uppercase text-xs">Backoff</FormLabel>
              <FormControl>
                <Select
                  value={backoff}
                  onValueChange={(value) =>
                    form.setValue(
                      "retries.backoff",
                      value as "constant" | "linear" | "exponential",
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger className="bg-background text-foreground w-full">
                    <SelectValue placeholder="Select a backoff type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background text-foreground">
                    <SelectItem value="exponential">Exponential</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="constant">Constant</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          </CollapsibleContent>
        </Collapsible>
        <Separator />
        <FormItem className="flex flex-col gap-1 mt-4">
          <FormLabel className="uppercase text-xs">
            Timeout{" "}
            <small className="text-[10px] text-muted-foreground">
              in milliseconds
            </small>
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              {...form.register("timeout", {
                valueAsNumber: true,
                min: 1,
                validate: (value) => value > 0 || "Timeout must be positive",
              })}
            />
          </FormControl>
        </FormItem>
        <Button className="mt-2 w-full" type="submit" disabled={!isDirty}>
          Save
        </Button>
      </form>
    </Form>
  );
}
