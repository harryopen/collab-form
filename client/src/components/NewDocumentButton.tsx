import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createDocument } from "../api/documents.ts";
import { authErrorMessage } from "../auth/errorMessage.ts";

export function NewDocumentButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isPending, isError, error, mutate } = useMutation({
    mutationFn: () => createDocument(),
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void navigate(`/d/${doc.id}`);
    },
  });

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={isPending}
        onClick={() => mutate()}
      >
        {isPending ? "Creating…" : "New document"}
      </button>
      {isError && (
        <p role="alert" className="form-error">
          {authErrorMessage(error)}
        </p>
      )}
    </div>
  );
}
