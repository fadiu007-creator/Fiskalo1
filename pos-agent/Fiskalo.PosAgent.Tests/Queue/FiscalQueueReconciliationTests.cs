using Fiskalo.PosAgent.Core.Queue;
using Xunit;

namespace Fiskalo.PosAgent.Tests.Queue;

public sealed class FiscalQueueReconciliationTests
{
    private sealed class TestProtector : IFiscalQueueProtector
    {
        public byte[] Protect(byte[] plaintext) => plaintext.ToArray();
        public byte[] Unprotect(byte[] protectedData) => protectedData.ToArray();
    }

    private static async Task<(FiscalQueueStore Store, string Path, string Key)> CreateInFlightAsync()
    {
        var path = Path.Combine(Path.GetTempPath(), "fiskalo-queue-test-" + Guid.NewGuid().ToString("N") + ".bin");
        var store = new FiscalQueueStore(path, new TestProtector());
        const string key = "nui:branch:pos:coupon";
        await store.EnqueueAsync(key, "Sale", Convert.ToBase64String(new byte[] { 1, 2 }), Convert.ToBase64String(new byte[] { 3, 4 }));
        await store.MarkSubmittingAsync(key);
        await store.MarkNeedsReconciliationAsync(key, "simulated uncertain response");
        return (store, path, key);
    }

    [Fact]
    public async Task OperatorCanResolveAsAcceptedWithAtkTransactionId()
    {
        var (store, path, key) = await CreateInFlightAsync();
        try
        {
            var item = await store.ResolveAsAcceptedAsync(key, "ATK-transaction-123");
            Assert.Equal(FiscalQueueStatus.Accepted, item.Status);
            Assert.Equal("ATK-transaction-123", item.AtkTransactionId);
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public async Task OperatorCanResolveAsRejectedWithAuditNote()
    {
        var (store, path, key) = await CreateInFlightAsync();
        try
        {
            var item = await store.ResolveAsRejectedAsync(key, "Checked ATK test records: rejected.");
            Assert.Equal(FiscalQueueStatus.Rejected, item.Status);
            Assert.Contains("rejected", item.LastError);
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public async Task NotFoundRequiresExplicitOperatorConfirmationBeforeManualResubmission()
    {
        var (store, path, key) = await CreateInFlightAsync();
        try
        {
            await Assert.ThrowsAsync<ArgumentException>(() => store.ResolveNotFoundAndRequeueAsync(key, false));
            var item = await store.ResolveNotFoundAndRequeueAsync(key, true);
            Assert.Equal(FiscalQueueStatus.Queued, item.Status);
            Assert.Contains("Operator confirmed", item.LastError);
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public async Task ConfirmedNotFoundCanBeRequeuedAfterRecoveryDeadline()
    {
        var (store, path, key) = await CreateInFlightAsync();
        try
        {
            var item = (await store.GetAllAsync()).Single();
            var requeued = await store.ResolveNotFoundAndRequeueAsync(key, true, item.RecoveryDeadlineUtc.AddSeconds(1));
            Assert.Equal(FiscalQueueStatus.Queued, requeued.Status);
            Assert.Single(await store.GetDueAsync(item.RecoveryDeadlineUtc.AddSeconds(1)));
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }
}
