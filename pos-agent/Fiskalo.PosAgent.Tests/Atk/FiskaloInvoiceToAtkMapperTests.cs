using Atk;
using Fiskalo.PosAgent.Core.Atk;
using Xunit;

namespace Fiskalo.PosAgent.Tests.Atk;

public sealed class FiskaloInvoiceToAtkMapperTests
{
    private static FiskaloFiscalInvoice Invoice(string status = "issued", ulong couponId = 123) =>
        new(
            status, 100000001, couponId, 7, "Prishtinë", "cashier-1", 3, 9, "verify-123",
            DateTimeOffset.FromUnixTimeSeconds(1_800_000_000),
            10m, 1.8m, 11.8m,
            new[] { new FiskaloFiscalLine("Product", 1m, 10m, 10m, 1.8m, "piece", "1", "0") },
            new[] { new PosCouponPaymentInput(PaymentType.Cash, 1180) });

    [Fact]
    public void MapsIssuedSaleUsingExplicitCatalogueAndPaymentCodes()
    {
        var mapped = FiskaloInvoiceToAtkMapper.Map(Invoice());

        Assert.Equal(CouponType.Sale, mapped.Type);
        Assert.Null(mapped.ReferenceCouponId);
        Assert.Equal(1180, mapped.TotalCents);
        Assert.Equal(180, mapped.TotalTaxCents);
        Assert.Equal(1000, mapped.TotalNoTaxCents);
        Assert.Equal("piece", mapped.Items[0].Unit);
        Assert.Equal("1", mapped.Items[0].TaxRate);
        Assert.Equal("0", mapped.Items[0].ItemType);
        var coupon = PosCouponBuilder.Build(mapped);
        Assert.Equal((ulong)123, coupon.CouponId);
    }

    [Theory]
    [InlineData(CouponType.Cancel)]
    [InlineData(CouponType.Return)]
    public void CancelAndReturnRequireOriginalCouponReference(CouponType type)
    {
        Assert.Throws<ArgumentException>(() => FiskaloInvoiceToAtkMapper.Map(Invoice(), type));
    }

    [Theory]
    [InlineData(CouponType.Cancel)]
    [InlineData(CouponType.Return)]
    public void CancelAndReturnPreserveOriginalCouponReference(CouponType type)
    {
        var mapped = FiskaloInvoiceToAtkMapper.Map(Invoice(), type, 77);
        Assert.Equal(type, mapped.Type);
        Assert.Equal((ulong)77, mapped.ReferenceCouponId);
        var coupon = PosCouponBuilder.Build(mapped);
        Assert.Equal(type, coupon.Type);
        Assert.Equal((ulong)77, coupon.ReferenceNo);
    }

    [Fact]
    public void RejectsDraftInvoices()
    {
        Assert.Throws<ArgumentException>(() => FiskaloInvoiceToAtkMapper.Map(Invoice("draft")));
    }

    [Fact]
    public void RejectsHeaderLineMismatch()
    {
        var source = Invoice();
        var invalid = source with { TotalEuro = 12m };
        Assert.Throws<ArgumentException>(() => FiskaloInvoiceToAtkMapper.Map(invalid));
    }

    [Fact]
    public void RejectsUnbalancedPaymentAllocations()
    {
        var source = Invoice();
        var invalid = source with { Payments = new[] { new PosCouponPaymentInput(PaymentType.Cash, 1000) } };
        Assert.Throws<ArgumentException>(() => FiskaloInvoiceToAtkMapper.Map(invalid));
    }

    [Fact]
    public void RejectsMissingExplicitAtkCatalogueCodes()
    {
        var source = Invoice();
        var invalid = source with { Lines = new[] { new FiskaloFiscalLine("Product", 1m, 10m, 10m, 1.8m, "", "1", "0") } };
        Assert.Throws<ArgumentException>(() => FiskaloInvoiceToAtkMapper.Map(invalid));
    }
}
