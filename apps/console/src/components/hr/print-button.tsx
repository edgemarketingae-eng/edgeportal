"use client";

import { Button } from "@edge/ui/components/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer /> Print or save as PDF
    </Button>
  );
}
