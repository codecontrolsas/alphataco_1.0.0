import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PdfFileIcon } from '@/shared/components/common/PdfFileIcon';

interface PDFPreviewDialogProps {
  buttonText?: string;
  children: React.ReactNode;
  className?: string;
}

export function PDFPreviewDialog({ buttonText = 'Ver PDF', children, className }: PDFPreviewDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn('gap-2', className)}>
          <PdfFileIcon />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <div className="flex-1 p-6 pt-0 overflow-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
